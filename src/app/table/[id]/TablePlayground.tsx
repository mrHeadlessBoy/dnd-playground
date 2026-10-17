'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  toggleReadyStatus,
  linkCharacterToTable,
  getTableMembers,
  getServerTime,
  resolveTurn,
  hostOverrideNarrative,
  voteKickMember,
  updateCharacterCombatState,
} from './actions'
import { COUNTDOWN_MS } from './countdown'
import {
  ABILITY_SCORE_KEYS,
  DEFAULT_ABILITY_SCORES,
  EMPTY_EQUIPMENT,
  clampHpValues,
  clampSkillCostValues,
  extractCharacterSkillCost,
  extractCharacterSkills,
  sanitizeAbilityScores,
  sanitizeCharacterSkills,
} from '@/app/characters/equipment'
import { abilityModifier, describeRoll, type DiceRoll } from '@/components/dice/dice'
import type { DiceActor } from '@/components/dice/DiceRoller'
import { playDiceRollSound, playSystemSound } from '@/lib/sound'
import CharacterInspectorPanel from './CharacterInspectorPanel'
import NarrativeFeedPanel from './NarrativeFeedPanel'
import PartyRosterSidebar from './PartyRosterSidebar'
import { useAlert } from '@/components/ui/AlertModal'
import {
  READY_CLAIM_TTL_MS,
  withReadyClaims,
  type CharacterCombatFormState,
  type Member,
  type ReadyClaim,
  type ReadyClaims,
  type TableData,
  type TablePlaygroundProps,
} from './types'

const COUNTDOWN_SECONDS = Math.ceil(COUNTDOWN_MS / 1000)

export default function TablePlayground({
  initialTable,
  initialMembers,
  initialTurns,
  lorebook,
  userCharacters,
  currentMember,
  userId,
  isHeadTable,
}: TablePlaygroundProps) {
  const { showAlert, showConfirm } = useAlert()
  const [table, setTable] = useState(initialTable)
  const [members, setMembers] = useState(initialMembers)
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null)
  const [turns, setTurns] = useState(initialTurns)
  const [draftAction, setDraftAction] = useState('')
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const [diceOpen, setDiceOpen] = useState(false)

  // Server clock minus this device's clock, in ms. countdown_end is stamped by the server,
  // so a device whose clock is a few seconds off would otherwise count down from another number.
  const clockOffsetRef = useRef(0)
  // Ready clicks the server's roster has not caught up with (this player's own, and ones announced by others)
  const readyClaimsRef = useRef<ReadyClaims>(new Map())
  // Roster refreshes run one at a time (see refreshMembers)
  const membersRefreshRef = useRef({ running: false, again: false })
  // When the table state last came from a trusted answer, so a slower, older poll result is dropped
  const tableSetAtRef = useRef(0)
  const seenPhaseRef = useRef(`${initialTable.turn_phase}:${initialTable.current_turn}`)

  // A new turn starts with an empty draft for every player, not only the host who resolved it
  const [draftTurn, setDraftTurn] = useState(initialTable.current_turn)
  if (table.current_turn !== draftTurn) {
    setDraftTurn(table.current_turn)
    setDraftAction('')
  }

  // Host override and AI generation states
  const [isResolving, setIsResolving] = useState(false)
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Character Inspector editing state
  const [isEditingChar, setIsEditingChar] = useState(false)
  const [isSavingChar, setIsSavingChar] = useState(false)
  const [isSwitchingChar, setIsSwitchingChar] = useState(false)
  const [charForm, setCharForm] = useState<CharacterCombatFormState>({
    current_hp: 10,
    max_hp: 10,
    armor_class: 10,
    current_skill_cost: 10,
    max_skill_cost: 10,
    status_condition: 'Normal',
    inventory: '',
    equipment: [...EMPTY_EQUIPMENT],
    stats: { ...DEFAULT_ABILITY_SCORES },
    skills: [],
  })

  // Ref to hold the Supabase channel for broadcasting
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Track known turns and members so sound notifications fire only on new arrivals
  const knownTurnIdsRef = useRef<Set<string>>(new Set(initialTurns.map((t) => t.id)))
  const knownMemberIdsRef = useRef<Set<string>>(new Set(initialMembers.map((m) => m.user_id)))

  // Play sound when player enters the table playground page
  useEffect(() => {
    playSystemSound('player_enter_table')
  }, [])

  // Play sound when another player enters the table
  useEffect(() => {
    let newPlayerEntered = false
    for (const m of members) {
      if (!knownMemberIdsRef.current.has(m.user_id)) {
        knownMemberIdsRef.current.add(m.user_id)
        newPlayerEntered = true
      }
    }
    if (newPlayerEntered) {
      playSystemSound('player_enter_table')
    }
  }, [members])

  // Play sound when AI replies with a new turn
  useEffect(() => {
    let hasNewTurn = false
    for (const t of turns) {
      if (!knownTurnIdsRef.current.has(t.id)) {
        knownTurnIdsRef.current.add(t.id)
        hasNewTurn = true
      }
    }
    if (hasNewTurn) {
      playSystemSound('ai_reply')
    }
  }, [turns])

  // Derive the active member and character dynamically from live members state
  const activeMember = members.find((m) => m.user_id === userId) || currentMember
  const activeChar = activeMember?.characters

  // The draft is locked once the player is ready, so the dice tray is locked with it
  // True on every player's screen while the Dungeon Master is writing the turn, not only the host's.
  const turnResolving =
    isResolving ||
    table.turn_phase === 'resolving' ||
    (table.turn_phase === 'countdown' && countdownSeconds === 0)

  const draftLocked =
    Boolean(activeMember?.is_ready) || table.turn_phase === 'countdown' || turnResolving

  // Let the player roll as their own character, with that sheet's ability bonuses
  const diceActors: DiceActor[] = activeChar
    ? [
        {
          id: activeChar.id,
          name: activeChar.name,
          modifiers: Object.fromEntries(
            ABILITY_SCORE_KEYS.map((key) => [
              key,
              abilityModifier(activeChar.stats?.[key]),
            ])
          ),
        },
      ]
    : []

  // Write the roll into the draft so the Dungeon Master reads the number when the turn resolves
  const handleDiceRoll = (roll: DiceRoll) => {
    if (draftLocked) return
    playDiceRollSound(roll.total)
    const result = describeRoll(roll)
    const text = result.startsWith(roll.label)
      ? `[ทอยเต๋า ${result}]`
      : `[ทอยเต๋า ${roll.label}: ${result}]`
    setDraftAction((current) => (current.trim() ? `${current.trim()} ${text}` : text))
  }

  const handleOpenEdit = () => {
    if (activeChar) {
      const { currentSkillCost, maxSkillCost } = extractCharacterSkillCost(activeChar)
      setCharForm({
        current_hp: activeChar.current_hp ?? 10,
        max_hp: activeChar.max_hp ?? 10,
        armor_class: currentSkillCost,
        current_skill_cost: currentSkillCost,
        max_skill_cost: maxSkillCost,
        status_condition: activeChar.status_condition || 'Normal',
        inventory: activeChar.inventory || '',
        equipment: [...(activeChar.equipment ?? EMPTY_EQUIPMENT)],
        stats: sanitizeAbilityScores(activeChar.stats, 0),
        skills: extractCharacterSkills(activeChar),
      })
    }
    setIsEditingChar(true)
  }

  // Ask the server what time it is, so the countdown below does not depend on this device's clock.
  useEffect(() => {
    let cancelled = false

    const syncClock = async () => {
      let bestRoundTrip = Infinity
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const sentAt = Date.now()
        try {
          const serverNow = await getServerTime()
          const roundTrip = Date.now() - sentAt
          if (!cancelled && roundTrip < bestRoundTrip) {
            bestRoundTrip = roundTrip
            clockOffsetRef.current = serverNow - (sentAt + roundTrip / 2)
          }
        } catch {
          // Keep the offset we already have
        }
      }
    }

    void syncClock()
    return () => {
      cancelled = true
    }
  }, [])

  // Reload the roster from the server, running at most one request at a time.
  const refreshMembers = useCallback(async () => {
    const refresh = membersRefreshRef.current
    if (refresh.running) {
      refresh.again = true
      return
    }
    refresh.running = true
    do {
      refresh.again = false
      const startedAt = Date.now()
      try {
        const latest: Member[] = await getTableMembers(table.id)
        setMembers(withReadyClaims(latest, readyClaimsRef.current, startedAt))
        setMemberLoadError(null)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to refresh party members'
        console.error(message)
        setMemberLoadError(message)
        playSystemSound('error')
      }
    } while (refresh.again)
    refresh.running = false
  }, [table.id])

  // Load members on page load and refresh them only when member state changes.
  useEffect(() => {
    const supabase = createClient()

    const fetchTable = async () => {
      const askedAt = Date.now()
      const { data } = await supabase.from('tables').select('*').eq('id', table.id).single()
      if (data && askedAt >= tableSetAtRef.current) setTable((prev) => ({ ...prev, ...data }))
    }

    const fetchTurns = async () => {
      const { data } = await supabase
        .from('turns')
        .select('*')
        .eq('table_id', table.id)
        .order('turn_number', { ascending: true })
      if (data) setTurns(data)
    }

    const channel = supabase
      .channel(`table_sync:${table.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables', filter: `id=eq.${table.id}` },
        (payload) => {
          const nextTable = payload.new as Partial<TableData> | null
          if (!nextTable) return
          tableSetAtRef.current = Date.now()
          setTable((currentTable) => ({
            ...currentTable,
            ...nextTable,
          }))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${table.id}` },
        () => {
          void refreshMembers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `table_id=eq.${table.id}` },
        () => {
          fetchTurns()
        }
      )
      .on('broadcast', { event: 'member_ready' }, ({ payload }) => {
        const memberUserId: unknown = payload?.userId
        const ready: unknown = payload?.ready
        const actionText: unknown = payload?.actionText
        if (typeof memberUserId !== 'string' || typeof ready !== 'boolean' || memberUserId === userId) {
          return
        }
        const safeActionText = typeof actionText === 'string' ? actionText : null
        readyClaimsRef.current.set(memberUserId, {
          ready,
          actionText: safeActionText,
          settledAt: null,
          expiresAt: Date.now() + READY_CLAIM_TTL_MS,
        })
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === memberUserId
              ? { ...m, is_ready: ready, action_text: ready ? safeActionText : null }
              : m
          )
        )
      })
      .on('broadcast', { event: 'table_sync' }, ({ payload }) => {
        const senderClaim =
          typeof payload?.userId === 'string' ? readyClaimsRef.current.get(payload.userId) : undefined
        if (senderClaim) senderClaim.settledAt = Date.now()
        void refreshMembers()
        fetchTable()
        fetchTurns()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({
            type: 'broadcast',
            event: 'table_sync',
            payload: { userId, timestamp: Date.now() },
          })
        }
      })

    channelRef.current = channel

    const interval = setInterval(() => {
      fetchTable()
      fetchTurns()
    }, 3000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [table.id, userId, refreshMembers])

  useEffect(() => {
    const phaseKey = `${table.turn_phase}:${table.current_turn}`
    if (phaseKey === seenPhaseRef.current) return
    seenPhaseRef.current = phaseKey
    readyClaimsRef.current.clear()
    void refreshMembers()
  }, [table.turn_phase, table.current_turn, refreshMembers])

  const broadcast = useCallback(
    (event: 'table_sync' | 'member_ready', extra: Record<string, unknown> = {}) => {
      try {
        channelRef.current?.send({
          type: 'broadcast',
          event,
          payload: { userId, timestamp: Date.now(), ...extra },
        })
      } catch {
        // Ignored if channel isn't ready
      }
    },
    [userId]
  )

  const broadcastSync = useCallback(() => broadcast('table_sync'), [broadcast])

  const handleResolveTurn = useCallback(async () => {
    setIsResolving(true)
    let failure: string | null = null
    try {
      const result = await resolveTurn(table.id)
      setDraftAction('')
      tableSetAtRef.current = Date.now()
      if (result.resolved && typeof result.turnNumber === 'number') {
        const nextTurn = result.turnNumber
        readyClaimsRef.current.clear()
        setTable((prev) => ({
          ...prev,
          current_turn: nextTurn,
          turn_phase: 'drafting',
          countdown_end: null,
        }))
        setMembers((prev) => prev.map((m) => ({ ...m, is_ready: false, action_text: null })))
        // Immediately fetch the newly written turn so the host sees it and hears Ai_reply.wav right away
        const supabase = createClient()
        const { data } = await supabase
          .from('turns')
          .select('*')
          .eq('table_id', table.id)
          .order('turn_number', { ascending: true })
        if (data) setTurns(data)
      } else {
        setTable((prev) => ({ ...prev, turn_phase: 'resolving' }))
      }
    } catch (err: unknown) {
      console.error(err)
      failure = err instanceof Error ? err.message : 'Error resolving turn with AI'
      tableSetAtRef.current = Date.now()
      setTable((prev) => ({ ...prev, turn_phase: 'drafting', countdown_end: null }))
    }
    setIsResolving(false)
    broadcastSync()
    if (failure) {
      showAlert(failure)
    }
  }, [table.id, broadcastSync, showAlert])

  // Synchronized countdown timer
  useEffect(() => {
    if (table.turn_phase !== 'countdown' || !table.countdown_end) {
      const resetId = window.setTimeout(() => {
        setCountdownSeconds(null)
      }, 0)
      return () => window.clearTimeout(resetId)
    }

    const countdownEnd = new Date(table.countdown_end)

    if (Number.isNaN(countdownEnd.getTime())) {
      const resetId = window.setTimeout(() => {
        setCountdownSeconds(null)
      }, 0)
      return () => window.clearTimeout(resetId)
    }

    const interval = setInterval(() => {
      const serverNow = Date.now() + clockOffsetRef.current
      const remaining = Math.min(
        COUNTDOWN_SECONDS,
        Math.max(0, Math.ceil((countdownEnd.getTime() - serverNow) / 1000))
      )
      setCountdownSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 250)
    return () => clearInterval(interval)
  }, [table.turn_phase, table.countdown_end])

  // Automatic turn resolution once the countdown reaches 0 (invoked by Head Table)
  useEffect(() => {
    if (
      !isHeadTable ||
      table.turn_phase !== 'countdown' ||
      countdownSeconds !== 0 ||
      isResolving
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void handleResolveTurn()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [countdownSeconds, isHeadTable, table.turn_phase, isResolving, handleResolveTurn])

  const handleReadyToggle = async () => {
    if (!activeMember || readyClaimsRef.current.get(userId)?.settledAt === null) return
    if (typeof table.current_turn !== 'number') return

    const nextState = !activeMember.is_ready
    const submittedAction = nextState ? draftAction.trim() : null
    const setOwnReady = (ready: boolean, actionText?: string | null) =>
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                is_ready: ready,
                action_text: ready ? (actionText ?? m.action_text ?? null) : null,
              }
            : m
        )
      )

    const claim: ReadyClaim = {
      ready: nextState,
      actionText: submittedAction,
      settledAt: null,
      expiresAt: Infinity,
    }
    readyClaimsRef.current.set(userId, claim)
    setOwnReady(nextState, submittedAction)
    broadcast('member_ready', { ready: nextState, actionText: submittedAction })

    let failure: string | null = null
    try {
      const phase = await toggleReadyStatus(
        table.id,
        nextState,
        nextState ? { turnNumber: table.current_turn, text: draftAction } : undefined
      )
      if (phase) {
        tableSetAtRef.current = Date.now()
        setTable((prev) => ({ ...prev, ...phase }))
      }
    } catch (err: unknown) {
      failure = err instanceof Error ? err.message : 'Failed to submit your action'
      readyClaimsRef.current.delete(userId)
      setOwnReady(!nextState, null)
      broadcast('member_ready', { ready: !nextState, actionText: null })
    }

    claim.settledAt = Date.now()
    broadcastSync()
    if (failure) {
      showAlert(failure)
    }
  }

  const handleSelectCharacter = async (charId: string) => {
    try {
      await linkCharacterToTable(table.id, charId)
      setMembers(await getTableMembers(table.id))
      setMemberLoadError(null)
      setIsSwitchingChar(false)
      broadcastSync()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to select character'
      console.error(message)
      showAlert(message)
    }
  }

  const handleSaveCharEdits = async () => {
    if (!activeChar) return
    setIsSavingChar(true)
    try {
      const sanitizedStats = sanitizeAbilityScores(charForm.stats, 0)
      const sanitizedSkills = sanitizeCharacterSkills(charForm.skills)
      const { currentHp, maxHp } = clampHpValues(charForm.current_hp, charForm.max_hp)
      const { currentSkillCost, maxSkillCost } = clampSkillCostValues(
        charForm.current_skill_cost,
        charForm.max_skill_cost
      )
      const formToSave = {
        ...charForm,
        current_hp: currentHp,
        max_hp: maxHp,
        armor_class: currentSkillCost,
        current_skill_cost: currentSkillCost,
        max_skill_cost: maxSkillCost,
        stats: {
          ...sanitizedStats,
          current_skill_cost: currentSkillCost,
          max_skill_cost: maxSkillCost,
          skills: sanitizedSkills,
        },
        skills: sanitizedSkills,
      }

      await updateCharacterCombatState(table.id, activeChar.id, formToSave)

      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                characters: m.characters
                  ? {
                      ...m.characters,
                      ...formToSave,
                    }
                  : null,
              }
            : m
        )
      )
      setIsEditingChar(false)
      broadcastSync()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to update character')
    } finally {
      setIsSavingChar(false)
    }
  }

  const handleSaveHostEdit = async (turnId: string) => {
    try {
      await hostOverrideNarrative(turnId, editText, table.id)
      setEditingTurnId(null)
      broadcastSync()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to save narrative edit')
    }
  }

  const handleKick = async (targetUserId: string, targetName: string) => {
    const confirmed = await showConfirm(`Remove ${targetName} from this table?`)
    if (confirmed) {
      try {
        await voteKickMember(table.id, targetUserId)
        broadcastSync()
      } catch (err: unknown) {
        showAlert(err instanceof Error ? err.message : 'Failed to remove member')
      }
    }
  }

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* LEFT PANEL: Character Inspector */}
      <CharacterInspectorPanel
        activeChar={activeChar}
        userCharacters={userCharacters}
        isEditingChar={isEditingChar}
        isSavingChar={isSavingChar}
        isSwitchingChar={isSwitchingChar}
        charForm={charForm}
        tableCode={table.table_code}
        isHeadTable={isHeadTable}
        onToggleEdit={() => {
          if (isEditingChar) {
            setIsEditingChar(false)
          } else {
            handleOpenEdit()
          }
        }}
        onStartSwitch={() => setIsSwitchingChar(true)}
        onCancelSwitch={() => setIsSwitchingChar(false)}
        onSelectCharacter={handleSelectCharacter}
        onChangeCharForm={setCharForm}
        onSaveCharEdits={handleSaveCharEdits}
        onCancelEdit={() => setIsEditingChar(false)}
      />

      {/* CENTER: Main Turn Narrative & Action Feed */}
      <NarrativeFeedPanel
        turns={turns}
        isHeadTable={isHeadTable}
        editingTurnId={editingTurnId}
        editText={editText}
        turnResolving={turnResolving}
        turnPhase={table.turn_phase}
        countdownSeconds={countdownSeconds}
        defaultCountdownSeconds={COUNTDOWN_SECONDS}
        isPlayerReady={Boolean(activeMember?.is_ready)}
        draftAction={draftAction}
        draftLocked={draftLocked}
        diceOpen={diceOpen}
        diceActors={diceActors}
        onStartEditTurn={(turn) => {
          setEditingTurnId(turn.id)
          setEditText(turn.narrative_output)
        }}
        onCancelEditTurn={() => setEditingTurnId(null)}
        onChangeEditText={setEditText}
        onSaveHostEdit={handleSaveHostEdit}
        onChangeDraftAction={setDraftAction}
        onToggleDiceOpen={() => setDiceOpen((open) => !open)}
        onCloseDice={() => setDiceOpen(false)}
        onDiceRoll={handleDiceRoll}
        onReadyToggle={handleReadyToggle}
      />

      {/* RIGHT PANEL: Party Roster & Lorebook Overview */}
      <PartyRosterSidebar
        members={members}
        memberLoadError={memberLoadError}
        headTableId={table.head_table_id}
        userId={userId}
        isHeadTable={isHeadTable}
        lorebook={lorebook}
        onKickMember={handleKick}
      />
    </div>
  )
}