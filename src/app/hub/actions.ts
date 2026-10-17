'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { generateOpeningNarrative } from '@/lib/ai/dm'
import { OPENING_TURN_NUMBER } from '@/lib/turns'

// Used as the opening narration only when the AI could not write one
const OPENING_FALLBACK = 'The journey begins. Review your character sheet and submit your opening moves.'

function generateTableCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// The opening narration of a new table: ask the AI Dungeon Master to open the story from the campaign sheet.
// A failed or slow AI call must never stop a table from opening, so any error ends in the fallback line.
async function writeOpeningScene(supabase: SupabaseServerClient, campaignId: string): Promise<string> {
  try {
    const [{ data: campaign }, { data: loreEntries }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).single(),
      supabase.from('lorebook_entries').select('*').eq('campaign_id', campaignId),
    ])
    if (!campaign) return OPENING_FALLBACK

    return await generateOpeningNarrative({ campaign, loreEntries: loreEntries || [] })
  } catch (err) {
    console.error('[launchTable] Opening scene generation failed:', err)
    return OPENING_FALLBACK
  }
}

export async function launchTable(campaignId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  // Written before anything is saved: if this request dies while the AI is thinking,
  // no half-made table (one without its opening row) is left behind.
  const openingNarrative = await writeOpeningScene(supabase, campaignId)

  const code = generateTableCode()

  // 1. Create table
  const { data: table, error: tableErr } = await supabase
    .from('tables')
    .insert({
      campaign_id: campaignId,
      head_table_id: user.id,
      table_code: code,
      turn_phase: 'drafting',
      current_turn: 1,
    })
    .select()
    .single()

  if (tableErr || !table) throw new Error(tableErr?.message || 'Table initialization failed')

  // 2. Add host as member
  await supabase.from('table_members').insert({
    table_id: table.id,
    user_id: user.id,
  })

  // 3. Save the opening narration. It is shown as an introduction, and play starts at Turn 1 after it.
  await supabase.from('turns').insert({
    table_id: table.id,
    turn_number: OPENING_TURN_NUMBER,
    narrative_output: openingNarrative,
  })

  redirect(`/table/${table.id}`)
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function extractTableIdentifier(rawInput: string): string {
  const trimmed = rawInput.trim()
  if (!trimmed) return ''

  const tablePathMatch = trimmed.match(/\/table\/([^/?#\s]+)/i)
  if (tablePathMatch?.[1]) {
    return decodeURIComponent(tablePathMatch[1]).trim()
  }

  try {
    if (trimmed.includes('://') || trimmed.startsWith('?')) {
      const url = new URL(trimmed.startsWith('?') ? `http://localhost/${trimmed}` : trimmed)
      const paramCode = url.searchParams.get('code') || url.searchParams.get('invite')
      if (paramCode) return paramCode.trim()
    }
  } catch {
    // Fall back to raw input
  }

  return trimmed
}

export async function joinTableByCode(
  codeOrLink: string
): Promise<{ success: boolean; tableId?: string; tableCode?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'กรุณาเข้าสู่ระบบก่อนเข้าร่วมโต๊ะ' }

  const identifier = extractTableIdentifier(codeOrLink)
  if (!identifier) return { success: false, error: 'กรุณากรอก Table Code หรือ Invite Link' }

  const isUuid = UUID_REGEX.test(identifier)
  const query = supabase.from('tables').select('id, table_code')
  const { data: table, error } = await (isUuid
    ? query.eq('id', identifier)
    : query.eq('table_code', identifier.toUpperCase())
  ).maybeSingle()

  if (error || !table) {
    return { success: false, error: 'ไม่พบโต๊ะดังกล่าว กรุณาตรวจสอบ Table Code หรือ Invite Link อีกครั้ง' }
  }

  // Insert member if not already joined (preserves existing character/ready state on re-entry)
  const { data: existingSeat } = await supabase
    .from('table_members')
    .select('id')
    .eq('table_id', table.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingSeat) {
    const { error: memberError } = await supabase.from('table_members').upsert(
      {
        table_id: table.id,
        user_id: user.id,
      },
      { onConflict: 'table_id,user_id' }
    )

    if (memberError) {
      return { success: false, error: `ไม่สามารถเข้าร่วมโต๊ะได้: ${memberError.message}` }
    }
  }

  revalidatePath('/hub')
  return { success: true, tableId: table.id, tableCode: table.table_code }
}

// Allows any participant to leave a table they joined
export async function leaveTable(tableId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('table_members')
    .delete()
    .eq('table_id', tableId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/hub')
}

// Deletes a table and all of its child rows.
async function purgeTables(supabase: SupabaseServerClient, tableIds: string[]) {
  if (tableIds.length === 0) return

  // Use service role admin client if available to ensure foreign key rows and child records are deleted cleanly
  const admin = (createAdminClient() || supabase) as SupabaseServerClient

  const { data: turns, error: turnsErr } = await admin
    .from('turns')
    .select('id')
    .in('table_id', tableIds)
  if (turnsErr) throw new Error(turnsErr.message)

  const turnIds = (turns ?? []).map((t: { id: string }) => t.id)
  if (turnIds.length > 0) {
    const { error } = await admin.from('turn_actions').delete().in('turn_id', turnIds)
    if (error) throw new Error(error.message)
  }

  const { error: delTurnsErr } = await admin.from('turns').delete().in('table_id', tableIds)
  if (delTurnsErr) throw new Error(delTurnsErr.message)

  const { error: delMembersErr } = await admin
    .from('table_members')
    .delete()
    .in('table_id', tableIds)
  if (delMembersErr) throw new Error(delMembersErr.message)

  const { data: deleted, error: delTablesErr } = await admin
    .from('tables')
    .delete()
    .in('id', tableIds)
    .select('id')
  if (delTablesErr) throw new Error(delTablesErr.message)

  if ((deleted ?? []).length !== tableIds.length) {
    throw new Error('Table could not be deleted. Check the DELETE policy on "tables" in Supabase.')
  }
}

export async function deleteTable(tableId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: table } = await supabase
    .from('tables')
    .select('id, head_table_id')
    .eq('id', tableId)
    .single()

  if (!table) throw new Error('Table not found')
  if (table.head_table_id !== user.id) {
    throw new Error('Only the Head Table can delete this table')
  }

  await purgeTables(supabase, [table.id])
  revalidatePath('/hub')
}

export async function deleteCampaign(campaignId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, creator_id')
    .eq('id', campaignId)
    .single()

  if (!campaign) throw new Error('Campaign not found')
  if (campaign.creator_id !== user.id) {
    throw new Error('Only the campaign creator can delete this campaign')
  }

  const admin = createAdminClient() || supabase

  // Remove every table running this campaign first.
  const { data: tables, error: tablesErr } = await admin
    .from('tables')
    .select('id')
    .eq('campaign_id', campaign.id)
  if (tablesErr) throw new Error(tablesErr.message)
  await purgeTables(admin, (tables ?? []).map((t: { id: string }) => t.id))

  const { error: loreErr } = await admin
    .from('lorebook_entries')
    .delete()
    .eq('campaign_id', campaign.id)
  if (loreErr) throw new Error(loreErr.message)

  const { data: deleted, error: campErr } = await admin
    .from('campaigns')
    .delete()
    .eq('id', campaign.id)
    .select('id')
  if (campErr) throw new Error(campErr.message)
  if (!deleted || deleted.length === 0) {
    throw new Error('Campaign could not be deleted. Check the DELETE policy on "campaigns" in Supabase.')
  }

  revalidatePath('/hub')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  try {
    const cookieStore = await cookies()
    cookieStore.set('dnd_session_start', '', { path: '/', maxAge: 0 })
  } catch {
    // Ignore if running where cookies cannot be directly set
  }
  redirect('/login')
}