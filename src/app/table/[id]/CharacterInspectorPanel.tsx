'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Edit3, Heart, Link2, Plus, RotateCcw, Save, Trash2, Zap } from 'lucide-react'
import {
  ABILITY_SCORE_KEYS,
  CHARACTER_CONDITIONS,
  EMPTY_EQUIPMENT,
  EQUIPMENT_LABELS,
  extractCharacterSkillCost,
  extractCharacterSkills,
} from '@/app/characters/equipment'
import type { Character, CharacterCombatFormState } from './types'

type CharacterInspectorPanelProps = {
  activeChar: Character | null | undefined
  userCharacters: Character[]
  isEditingChar: boolean
  isSavingChar: boolean
  isSwitchingChar: boolean
  charForm: CharacterCombatFormState
  tableCode: string
  isHeadTable: boolean
  onToggleEdit: () => void
  onStartSwitch: () => void
  onCancelSwitch: () => void
  onSelectCharacter: (charId: string) => void
  onChangeCharForm: (next: CharacterCombatFormState) => void
  onSaveCharEdits: () => void
  onCancelEdit: () => void
}

export default function CharacterInspectorPanel({
  activeChar,
  userCharacters,
  isEditingChar,
  isSavingChar,
  isSwitchingChar,
  charForm,
  tableCode,
  isHeadTable,
  onToggleEdit,
  onStartSwitch,
  onCancelSwitch,
  onSelectCharacter,
  onChangeCharForm,
  onSaveCharEdits,
  onCancelEdit,
}: CharacterInspectorPanelProps) {
  const [copiedInvite, setCopiedInvite] = useState(false)
  const activeSkills = extractCharacterSkills(activeChar)
  const { currentSkillCost, maxSkillCost } = extractCharacterSkillCost(activeChar)

  const handleCopyInviteLink = async () => {
    const inviteUrl = `${window.location.origin}/table/${tableCode}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    } catch {
      // Fallback ignored
    }
  }

  return (
    <aside className="w-80 border-r border-zinc-800 bg-zinc-900/40 p-5 flex flex-col justify-between overflow-y-auto">
      <div className="space-y-6">
        <Link
          href="/hub"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Campaign Hub
        </Link>
        <div className="border-b border-zinc-800 pb-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-500">
              Character Inspector
            </span>
            {activeChar && !isSwitchingChar && (
              <div className="flex gap-2">
                <button
                  onClick={onToggleEdit}
                  className="text-[10px] text-zinc-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" /> {isEditingChar ? 'Close' : 'Edit'}
                </button>
                <button
                  onClick={onStartSwitch}
                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Switch
                </button>
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            {activeChar ? activeChar.name : 'No Character Bound'}
          </h2>
          <p className="text-xs text-zinc-400">
            {activeChar?.class_archetype || 'Select a sheet below to participate'}
          </p>
        </div>

        {!activeChar || isSwitchingChar ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs text-zinc-400 font-medium">
                Select a character for this session:
              </label>
              {isSwitchingChar && (
                <button
                  onClick={onCancelSwitch}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
            {userCharacters.map((char) => {
              const cost = extractCharacterSkillCost(char)
              return (
                <button
                  key={char.id}
                  onClick={() => onSelectCharacter(char.id)}
                  className="w-full text-left p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-amber-500 text-xs transition cursor-pointer"
                >
                  <p className="font-semibold text-white">{char.name}</p>
                  <p className="text-zinc-500">
                    {char.class_archetype} | HP: {char.current_hp}/{char.max_hp} | Skill Cost:{' '}
                    {cost.currentSkillCost}/{cost.maxSkillCost}
                  </p>
                </button>
              )
            })}
            {userCharacters.length === 0 && (
              <p className="text-xs text-zinc-500 italic">
                No character sheets found. Create one in the Character Codex.
              </p>
            )}
          </div>
        ) : isEditingChar ? (
          /* Inline Character Editor */
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase font-mono">Current HP</label>
                <input
                  type="number"
                  max={charForm.max_hp}
                  value={charForm.current_hp}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    onChangeCharForm({
                      ...charForm,
                      current_hp: Number.isNaN(val) ? 0 : Math.min(charForm.max_hp, val),
                    })
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400 uppercase font-mono">Max HP</label>
                <input
                  type="number"
                  min={1}
                  value={charForm.max_hp}
                  onChange={(e) => {
                    const newMax = Number(e.target.value)
                    const clampedMax = Number.isNaN(newMax) ? 1 : newMax
                    onChangeCharForm({
                      ...charForm,
                      max_hp: clampedMax,
                      current_hp: Math.min(clampedMax, charForm.current_hp),
                    })
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase font-mono">
                  Current Skill Cost
                </label>
                <input
                  type="number"
                  min={0}
                  max={charForm.max_skill_cost}
                  value={charForm.current_skill_cost}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    const clamped = Number.isNaN(val)
                      ? 0
                      : Math.max(0, Math.min(charForm.max_skill_cost, val))
                    onChangeCharForm({
                      ...charForm,
                      current_skill_cost: clamped,
                      armor_class: clamped,
                    })
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400 uppercase font-mono">
                  Max Skill Cost
                </label>
                <input
                  type="number"
                  min={0}
                  value={charForm.max_skill_cost}
                  onChange={(e) => {
                    const newMax = Number(e.target.value)
                    const clampedMax = Number.isNaN(newMax) ? 0 : Math.max(0, newMax)
                    const nextCur = Math.min(clampedMax, charForm.current_skill_cost)
                    onChangeCharForm({
                      ...charForm,
                      max_skill_cost: clampedMax,
                      current_skill_cost: nextCur,
                      armor_class: nextCur,
                    })
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 uppercase font-mono">Condition</label>
              <select
                value={charForm.status_condition}
                onChange={(e) =>
                  onChangeCharForm({ ...charForm, status_condition: e.target.value })
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-xs text-white mt-0.5"
              >
                {CHARACTER_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Stats Editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-zinc-400 uppercase font-mono block">
                  Ability Scores
                </label>
                <span className="text-[9px] text-zinc-500 font-mono">Allows negative</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {ABILITY_SCORE_KEYS.map((stat) => (
                  <div
                    key={stat}
                    className="bg-zinc-950 border border-zinc-800 rounded p-1 text-center"
                  >
                    <span className="text-[9px] text-zinc-500 uppercase block">{stat}</span>
                    <input
                      type="number"
                      value={charForm.stats[stat] ?? 10}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          onChangeCharForm({
                            ...charForm,
                            stats: { ...charForm.stats, [stat]: raw },
                          })
                          return
                        }
                        const val = Number(raw)
                        if (!Number.isNaN(val)) {
                          onChangeCharForm({
                            ...charForm,
                            stats: { ...charForm.stats, [stat]: val },
                          })
                        }
                      }}
                      className="w-full bg-transparent text-center font-bold text-xs text-white outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory Editor */}
            <div>
              <label className="text-[10px] text-zinc-400 uppercase font-mono">Inventory</label>
              <textarea
                rows={3}
                value={charForm.inventory}
                onChange={(e) => onChangeCharForm({ ...charForm, inventory: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-white mt-1"
              />
            </div>

            {/* Equipment Slots Editor */}
            <div>
              <label className="text-[10px] text-zinc-400 uppercase font-mono block mb-1">
                Equipment Slots
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {EQUIPMENT_LABELS.map((label, idx) => (
                  <div key={label}>
                    <span className="text-[9px] text-zinc-500 uppercase block">{label}</span>
                    <input
                      type="text"
                      placeholder={`${label}...`}
                      value={(charForm.equipment ?? EMPTY_EQUIPMENT)[idx] || ''}
                      onChange={(e) => {
                        const next = [...(charForm.equipment ?? EMPTY_EQUIPMENT)]
                        next[idx] = e.target.value
                        onChangeCharForm({ ...charForm, equipment: next })
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-1 text-[11px] text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400 uppercase font-mono block">Skill</label>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {(charForm.skills || []).length} slot(s)
                </span>
              </div>
              <div className="space-y-2">
                {(charForm.skills || []).map((skill, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-zinc-950 border border-zinc-800 rounded space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-amber-500 font-mono uppercase">
                        Skill #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextSkills = (charForm.skills || []).filter((_, i) => i !== idx)
                          onChangeCharForm({ ...charForm, skills: nextSkills })
                        }}
                        title="Remove skill"
                        className="text-zinc-500 hover:text-red-400 p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase font-mono block">
                        Skill Name :
                      </span>
                      <input
                        type="text"
                        placeholder="Skill name..."
                        value={skill.name}
                        onChange={(e) => {
                          const nextSkills = [...(charForm.skills || [])]
                          nextSkills[idx] = { ...nextSkills[idx], name: e.target.value }
                          onChangeCharForm({ ...charForm, skills: nextSkills })
                        }}
                        className="w-full mt-0.5 bg-zinc-900 border border-zinc-700 rounded p-1 text-[11px] text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase font-mono block">
                        Skill Cost :
                      </span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={skill.cost ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          const nextSkills = [...(charForm.skills || [])]
                          nextSkills[idx] = {
                            ...nextSkills[idx],
                            cost: Number.isNaN(val) ? 0 : Math.max(0, val),
                          }
                          onChangeCharForm({ ...charForm, skills: nextSkills })
                        }}
                        className="w-full mt-0.5 bg-zinc-900 border border-zinc-700 rounded p-1 text-[11px] text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase font-mono block">
                        Description :
                      </span>
                      <input
                        type="text"
                        placeholder="Description..."
                        value={skill.description}
                        onChange={(e) => {
                          const nextSkills = [...(charForm.skills || [])]
                          nextSkills[idx] = { ...nextSkills[idx], description: e.target.value }
                          onChangeCharForm({ ...charForm, skills: nextSkills })
                        }}
                        className="w-full mt-0.5 bg-zinc-900 border border-zinc-700 rounded p-1 text-[11px] text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeCharForm({
                    ...charForm,
                    skills: [...(charForm.skills || []), { name: '', cost: 0, description: '' }],
                  })
                }
                className="w-full py-1.5 px-2 bg-zinc-950 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-amber-500/60 text-amber-400 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Skill
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onSaveCharEdits}
                disabled={isSavingChar}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 rounded text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> {isSavingChar ? 'Saving...' : 'Save Sheet'}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Combat Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                    Hit Points
                  </span>
                  <span className="font-bold text-sm text-white">
                    {activeChar.current_hp} / {activeChar.max_hp}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                    Skill Cost
                  </span>
                  <span className="font-bold text-sm text-white">
                    {currentSkillCost} / {maxSkillCost}
                  </span>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg flex justify-between items-center">
              <span className="text-zinc-400">Condition:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  activeChar.status_condition === 'Normal'
                    ? 'bg-zinc-800 text-zinc-300'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {activeChar.status_condition || 'Normal'}
              </span>
            </div>

            {/* Attributes */}
            <div className="grid grid-cols-3 gap-2">
              {ABILITY_SCORE_KEYS.map((key) => (
                <div key={key} className="bg-zinc-950 border border-zinc-800/80 rounded p-2 text-center">
                  <span className="text-[9px] text-zinc-500 block uppercase font-mono">{key}</span>
                  <span className="font-bold text-white text-xs">
                    {String(activeChar.stats?.[key] ?? 10)}
                  </span>
                </div>
              ))}
            </div>

            {/* Inventory */}
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-400">Inventory</span>
              <div className="mt-1 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 min-h-15 whitespace-pre-line text-[11px]">
                {activeChar.inventory || 'Empty'}
              </div>
            </div>

            {/* Equipment Slots */}
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-400">Equipment</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {EQUIPMENT_LABELS.map((label, idx) => {
                  const item = (activeChar.equipment ?? EMPTY_EQUIPMENT)[idx]
                  return (
                    <div
                      key={label}
                      className="p-1.5 bg-zinc-950 border border-zinc-800 rounded text-[11px]"
                    >
                      <span className="text-[9px] text-zinc-500 uppercase block">{label}</span>
                      <span className="text-zinc-300">{item || '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Skill Slots */}
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-400">Skill</span>
              {activeSkills.length > 0 ? (
                <div className="mt-1 space-y-1.5">
                  {activeSkills.map((skill, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] space-y-0.5"
                    >
                      <p className="text-amber-400 font-semibold">
                        <span className="text-[9px] text-zinc-500 uppercase font-mono mr-1">
                          Skill Name :
                        </span>
                        {skill.name || 'Unnamed Skill'}
                      </p>
                      <p className="text-cyan-400 font-mono">
                        <span className="text-[9px] text-zinc-500 uppercase font-mono mr-1">
                          Skill Cost :
                        </span>
                        {skill.cost ?? 0}
                      </p>
                      {skill.description && (
                        <p className="text-zinc-300 whitespace-pre-line">
                          <span className="text-[9px] text-zinc-500 uppercase font-mono mr-1">
                            Description :
                          </span>
                          {skill.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-500 italic text-[11px]">
                  No skills
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <button
          type="button"
          onClick={handleCopyInviteLink}
          className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-amber-500/50 text-xs font-medium text-zinc-300 hover:text-amber-400 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {copiedInvite ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Invite Link Copied!</span>
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5 text-amber-500" />
              <span>Copy Invite Link</span>
            </>
          )}
        </button>
        <div className="text-[10px] font-mono text-zinc-500 flex justify-between items-center">
          <span>CODE: {tableCode}</span>
          <span>{isHeadTable ? 'HEAD TABLE' : 'PLAYER'}</span>
        </div>
      </div>
    </aside>
  )
}
