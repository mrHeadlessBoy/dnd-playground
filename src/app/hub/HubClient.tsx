'use client'

import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { launchTable, joinTableByCode, deleteTable, deleteCampaign, leaveTable } from './actions'
import { Play, LogIn, Compass, Trash2, Loader2, LogOut, Dices, Info, Pencil, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2, Check } from 'lucide-react'
import Link from 'next/link'

import { playSystemSound } from '@/lib/sound'
import { AlertModal, useAlert } from '@/components/ui/AlertModal'

type PublicCampaign = {
  id: string | number
  category: string
  title: string
  core_description: string
  creator_id?: string | null
}

type ActiveTable = {
  id: string | number
  table_code: string
  current_turn: number | string
  turn_phase: string
  head_table_id?: string | null
  campaigns?: { title?: string } | null
}

type HubClientProps = {
  publicCampaigns: PublicCampaign[]
  activeTables: ActiveTable[]
  currentUserId: string | null
}

// Launching now waits for the AI Dungeon Master to write the opening scene. The button shows that
// it is working and cannot be pressed twice, because a second press would open a second table.
function LaunchButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full  py-2 bg-amber-600/90 hover:bg-amber-600 rounded-lg text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
    >
      {pending ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> The DM is writing the opening scene...
        </>
      ) : (
        <>
          <Play className="w-3.5 h-3.5" /> Launch as Head Table
        </>
      )}
    </button>
  )
}

function ActiveTableCard({
  tbl,
  currentUserId,
  deletingId,
  onDelete,
  onLeave,
}: {
  tbl: ActiveTable
  currentUserId: string | null
  deletingId: string | null
  onDelete: (tbl: ActiveTable) => void
  onLeave: (tbl: ActiveTable) => void
}) {
  const [copiedLink, setCopiedLink] = useState(false)

  const handleCopyInviteLink = async () => {
    const inviteUrl = `${window.location.origin}/table/${tbl.table_code}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Fallback if clipboard API fails
    }
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase font-mono tracking-widest text-amber-500">
            CODE: {tbl.table_code}
          </span>
          <button
            type="button"
            onClick={handleCopyInviteLink}
            title="Copy direct invite link to Table Playground"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 text-[10px] font-mono text-zinc-300 hover:text-amber-400 transition cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="w-3 h-3" />
                <span>Invite Link</span>
              </>
            )}
          </button>
        </div>
        <h3 className="text-base font-semibold text-white mt-1">{tbl.campaigns?.title}</h3>
        <p className="text-xs text-zinc-400 mt-1">
          Turn: {tbl.current_turn} | Phase: {tbl.turn_phase}
        </p>
      </div>
      <Link
        href={`/table/${tbl.id}`}
        className="mt-4 inline-flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium text-white transition"
      >
        <Play className="w-3.5 h-3.5" /> Re-enter Table
      </Link>
      {currentUserId && tbl.head_table_id === currentUserId ? (
        <button
          type="button"
          onClick={() => onDelete(tbl)}
          disabled={deletingId !== null}
          className="mt-2 inline-flex items-center justify-center gap-2 w-full py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 rounded-lg text-xs font-medium text-red-300 transition disabled:opacity-50 cursor-pointer"
        >
          {deletingId === `table:${tbl.id}` ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete Table
        </button>
      ) : currentUserId ? (
        <button
          type="button"
          onClick={() => onLeave(tbl)}
          disabled={deletingId !== null}
          className="mt-2 inline-flex items-center justify-center gap-2 w-full py-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
        >
          {deletingId === `leave:${tbl.id}` ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          Leave Table
        </button>
      ) : null}
    </div>
  )
}

function CampaignCard({
  camp,
  currentUserId,
  deletingId,
  onDelete,
}: {
  camp: PublicCampaign
  currentUserId: string | null
  deletingId: string | null
  onDelete: (camp: PublicCampaign) => void
}) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
      <div>
        <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{camp.category}</span>
        <h3 className="text-lg font-bold text-white mt-2">{camp.title}</h3>
        <p className="text-xs text-zinc-400 mt-2 min-h-20 line-clamp-3">{camp.core_description}</p>
      </div>
      <form action={launchTable.bind(null, String(camp.id))} className="mt-5">
        <LaunchButton />
      </form>
      {/* Details Button - Only shown if user is NOT the owner */}
      {camp.creator_id !== currentUserId && (
        <Link
          href={`/campaigns/${camp.id}`}
          className="mt-2 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-300 transition flex items-center justify-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5" /> Details
        </Link>
      )}

      {/* Edit Button - Only shown if user IS the owner */}
      {currentUserId && camp.creator_id === currentUserId && (
        <Link
          href={`/campaigns/${camp.id}/edit`}
          className="mt-2 py-2 bg-zinc-800 hover:bg-zinc-700 border border-amber-700/50 rounded-lg text-xs font-medium text-amber-300 transition flex items-center justify-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Link>
      )}
      {currentUserId && camp.creator_id === currentUserId && (
        <button
          type="button"
          onClick={() => onDelete(camp)}
          disabled={deletingId !== null}
          className="mt-2 w-full py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 rounded-lg text-xs font-medium text-red-300 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {deletingId === `campaign:${camp.id}` ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete Campaign
        </button>
      )}
    </div>
  )
}

const CAMPAIGNS_PER_PAGE = 6

export default function HubClient({ publicCampaigns, activeTables, currentUserId }: HubClientProps) {
  const router = useRouter()
  const { showAlert, showConfirm } = useAlert()
  const [tableCode, setTableCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinModal, setJoinModal] = useState<{
    open: boolean
    status: 'loading' | 'success' | 'error'
    message?: string
    code?: string
  }>({ open: false, status: 'loading' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isExtended, setIsExtended] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const touchStartX = useRef<number | null>(null)

  // Ensure join modal is closed when returning to the hub via browser back/forward buttons
  useEffect(() => {
    const handleReset = () => {
      setJoinModal({ open: false, status: 'loading' })
      setJoining(false)
    }
    window.addEventListener('popstate', handleReset)
    window.addEventListener('pageshow', handleReset)
    return () => {
      window.removeEventListener('popstate', handleReset)
      window.removeEventListener('pageshow', handleReset)
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(publicCampaigns.length / CAMPAIGNS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1))

  const campaignPages = useMemo(() => {
    const pages: PublicCampaign[][] = []
    for (let i = 0; i < publicCampaigns.length; i += CAMPAIGNS_PER_PAGE) {
      pages.push(publicCampaigns.slice(i, i + CAMPAIGNS_PER_PAGE))
    }
    return pages
  }, [publicCampaigns])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diffX = touchStartX.current - e.changedTouches[0].clientX
    if (diffX > 50 && safeCurrentPage < totalPages - 1) {
      setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
    } else if (diffX < -50 && safeCurrentPage > 0) {
      setCurrentPage((p) => Math.max(0, p - 1))
    }
    touchStartX.current = null
  }

  const handleDeleteTable = async (tbl: ActiveTable) => {
    const name = tbl.campaigns?.title ?? tbl.table_code
    const confirmed = await showConfirm(`Delete table "${name}" (${tbl.table_code})? All turns and members will be removed. This cannot be undone.`)
    if (!confirmed) return
    setDeletingId(`table:${tbl.id}`)
    try {
      await deleteTable(String(tbl.id))
      router.refresh()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to delete table.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleLeaveTable = async (tbl: ActiveTable) => {
    const name = tbl.campaigns?.title ?? tbl.table_code
    const confirmed = await showConfirm(`Leave table "${name}" (${tbl.table_code})?`)
    if (!confirmed) return
    setDeletingId(`leave:${tbl.id}`)
    try {
      await leaveTable(String(tbl.id))
      router.refresh()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to leave table.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteCampaign = async (camp: PublicCampaign) => {
    const title = camp.title || 'Untitled Campaign'
    const confirmed = await showConfirm(`Delete campaign "${title}"? Its lorebook and every table running it will be removed. This cannot be undone.`)
    if (!confirmed) return
    setDeletingId(`campaign:${camp.id}`)
    try {
      await deleteCampaign(String(camp.id))
      router.refresh()
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to delete campaign.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleJoin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const rawInput = tableCode.trim()
    if (!rawInput) return

    const displayBadge =
      rawInput.match(/\/table\/([^/?#\s]+)/i)?.[1]?.toUpperCase() ||
      (rawInput.length <= 12 ? rawInput.toUpperCase() : 'INVITE LINK')

    setJoining(true)
    setJoinModal({
      open: true,
      status: 'loading',
      code: displayBadge,
      message: 'กำลังตรวจสอบรหัสโต๊ะและจัดเตรียมที่นั่งสำหรับคุณ...',
    })

    try {
      const res = await joinTableByCode(rawInput)
      if (res.success && res.tableId) {
        setJoinModal({
          open: true,
          status: 'success',
          code: res.tableCode || displayBadge,
          message: 'เข้าร่วมโต๊ะสำเร็จ! กำลังพาท่านเดินทางเข้าสู่ห้องเล่น...',
        })
        const targetTableId = res.tableId
        router.push(`/table/${targetTableId}`)
        // Reset modal and inputs after starting navigation so returning via Back button is clean
        setTimeout(() => {
          setJoinModal({ open: false, status: 'loading' })
          setJoining(false)
          setTableCode('')
        }, 1200)
      } else {
        playSystemSound('error')
        setJoinModal({
          open: true,
          status: 'error',
          code: displayBadge,
          message: res.error || 'ไม่พบโต๊ะดังกล่าว กรุณาตรวจสอบ Table Code หรือ Invite Link อีกครั้ง',
        })
      }
    } catch (err: unknown) {
      playSystemSound('error')
      setJoinModal({
        open: true,
        status: 'error',
        code: displayBadge,
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเข้าโต๊ะ',
      })
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="space-y-10">
      {/* Quick Join Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Have a Table Code or Invite Link?</h2>
          <p className="text-xs text-zinc-400">
            Enter the 6-character code or paste an invite link from your Head Table to join or re-enter.
          </p>
        </div>
        <form onSubmit={handleJoin} className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Code (e.g. 7K4X9B) or Invite Link"
            value={tableCode}
            onChange={(e) => {
              const val = e.target.value
              setTableCode(val.includes('/') || val.includes(':') ? val : val.toUpperCase())
            }}
            className="bg-zinc-950 border border-zinc-700 px-3 py-2 rounded-lg text-sm font-mono text-white focus:border-amber-500 outline-none w-full sm:w-64"
          />
          <button
            type="submit"
            disabled={joining}
            className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <LogIn className="w-4 h-4" /> Join
          </button>
        </form>
      </div>

      {/* Active Tables */}
      {activeTables.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Your Active Tables</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeTables.map((tbl) => (
              <ActiveTableCard
                key={tbl.id}
                tbl={tbl}
                currentUserId={currentUserId}
                deletingId={deletingId}
                onDelete={handleDeleteTable}
                onLeave={handleLeaveTable}
              />
            ))}
          </div>
        </div>
      )}

      {/* Public Campaigns */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <button
            type="button"
            onClick={() => setIsExtended((prev) => !prev)}
            aria-expanded={isExtended}
            aria-controls="explore-campaigns-section"
            className="flex items-center gap-2.5 text-lg font-semibold text-white hover:text-amber-400 transition cursor-pointer select-none group text-left"
          >
            <Compass className="w-5 h-5 text-amber-500 group-hover:rotate-12 transition-transform" />
            <span>Explore Campaigns</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 group-hover:text-zinc-200 font-normal">
              {publicCampaigns.length}
            </span>
            <span className="text-xs text-zinc-400 group-hover:text-amber-400 flex items-center gap-1 ml-1 font-normal">
              {isExtended ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span className="hidden sm:inline">Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Extend</span>
                </>
              )}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {isExtended && totalPages > 1 && (
              <div className="flex items-center gap-1.5 text-xs bg-zinc-900/80 border border-zinc-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={safeCurrentPage === 0}
                  aria-label="Previous campaigns"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-1.5 text-zinc-300 font-mono text-[11px] select-none">
                  {safeCurrentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safeCurrentPage >= totalPages - 1}
                  aria-label="Next campaigns"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsExtended((prev) => !prev)}
              aria-expanded={isExtended}
              aria-controls="explore-campaigns-section"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition cursor-pointer"
            >
              {isExtended ? (
                <>
                  <span>Collapse</span>
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                </>
              ) : (
                <>
                  <span>Extend</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                </>
              )}
            </button>
          </div>
        </div>

        {isExtended ? (
          <div id="explore-campaigns-section" className="space-y-4">
            {publicCampaigns.length === 0 ? (
              <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center text-zinc-500 text-sm">
                No public campaigns available yet.
              </div>
            ) : (
              <>
                <div
                  className="relative overflow-hidden"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className="flex transition-transform duration-300 ease-out items-start"
                    style={{ transform: `translateX(-${safeCurrentPage * 100}%)` }}
                  >
                    {campaignPages.map((pageCamps, pageIndex) => (
                      <div
                        key={pageIndex}
                        className="w-full shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                      >
                        {pageCamps.map((camp) => (
                          <CampaignCard
                            key={camp.id}
                            camp={camp}
                            currentUserId={currentUserId}
                            deletingId={deletingId}
                            onDelete={handleDeleteCampaign}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2 px-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      disabled={safeCurrentPage === 0}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </button>

                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalPages }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCurrentPage(idx)}
                          aria-label={`Go to slide ${idx + 1}`}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === safeCurrentPage
                              ? 'w-6 bg-amber-500'
                              : 'w-2 bg-zinc-700 hover:bg-zinc-500'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={safeCurrentPage >= totalPages - 1}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            onClick={() => setIsExtended(true)}
            className="bg-zinc-900/20 border border-zinc-800/60 border-dashed rounded-xl p-4 text-center text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Explore Campaigns is collapsed ({publicCampaigns.length} campaigns available). Click to extend.</span>
          </div>
        )}
      </div>

      {/* Battle Board entry: floats in the bottom-right corner of the hub */}
      <Link
        href="/board"
        className="group fixed bottom-6 right-6 z-20 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-zinc-900/80 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur transition hover:border-amber-400 hover:bg-zinc-900"
      >
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-600 text-white transition group-hover:bg-amber-500">
          <Dices className="w-5 h-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-white">Battle Board</span>
          <span className="block text-[11px] text-zinc-400">3D grid tabletop · solo prototype</span>
        </span>
      </Link>

      {/* Join Table Status Modal */}
      <AlertModal
        isOpen={joinModal.open}
        onClose={() => setJoinModal((prev) => ({ ...prev, open: false }))}
        status={joinModal.status}
        title={
          joinModal.status === 'loading'
            ? 'กำลังเข้าสู่โต๊ะ...'
            : joinModal.status === 'success'
            ? 'เข้าร่วมสำเร็จ!'
            : 'ไม่สามารถเข้าห้องได้'
        }
        badge={joinModal.code ? `CODE: ${joinModal.code}` : undefined}
        message={joinModal.message}
        playSound={false}
      />
    </div>
  )
}