'use client'

import { useEffect, useMemo, useState } from 'react'
import { startSession, saveAnswer, materialize, brief as getBrief, respond } from '@/app/admin/new/guided/actions'
import { nextQuestion, type FactMap, type Question, type Owner } from '@/lib/onboarding/questions'
import { localizeQuestions, localizeStages, stageLabel, localizeSummary, ob } from '@/lib/onboarding/i18n'
import { useLocale } from '@/components/I18nProvider'
import type { Locale } from '@/lib/i18n'

type Firm = { id: string; name: string; is_platform: boolean }
type Brief = { read: string; handling: string }

const chip =
  'rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-900 hover:border-gray-900 hover:bg-gray-50 transition-colors'
const input =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
// Buttons across the flow are text, not filled boxes — the CTA is the words.
const primary =
  'inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-400 disabled:opacity-40 disabled:hover:text-gray-900 transition-colors'
const ghost = 'text-sm text-gray-400 hover:text-gray-900 transition-colors'
const serif = { fontFamily: 'var(--font-fraunces), serif' } as const

// Owners split ownership automatically: any owner the operator has NOT pinned
// shares whatever percentage is left after the pinned ones, evenly. So one owner
// is 100%, two become 50/50, pin one at 70 and the other lands on 30.
type OwnerRow = { name: string; pct: number | null; locked: boolean }

function redistributeOwners(rows: OwnerRow[]): OwnerRow[] {
  const lockedTotal = rows.reduce((s, o) => s + (o.locked && o.pct != null ? o.pct : 0), 0)
  const unlocked = rows.filter((o) => !o.locked)
  if (unlocked.length === 0) return rows
  const remaining = Math.max(0, 100 - lockedTotal)
  const base = Math.floor(remaining / unlocked.length)
  let extra = remaining - base * unlocked.length // hand the rounding remainder out one point at a time
  return rows.map((o) => {
    if (o.locked) return o
    const share = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    return { ...o, pct: share }
  })
}

const clampPct = (v: string): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
}

// Which stages are done / current, derived from the facts.
function stageStatus(
  facts: FactMap,
  currentStage: string | undefined,
  questions: Question[],
  stages: { key: string; label: string }[]
) {
  return stages.map((s) => {
    const qs = questions.filter((q) => q.stage === s.key && (!q.appliesWhen || q.appliesWhen(facts)))
    const done = qs.every((q) => facts[q.key] !== undefined)
    return { key: s.key, label: s.label, done, current: currentStage === s.key }
  })
}

export default function GuidedOnboarding({
  firms,
  defaultOrg,
  isPlatform,
}: {
  firms: Firm[]
  defaultOrg?: string
  isPlatform: boolean
}) {
  const locale = useLocale()
  const questions = useMemo(() => localizeQuestions(locale), [locale])
  const stages = useMemo(() => localizeStages(locale), [locale])

  const [phase, setPhase] = useState<'start' | 'question' | 'review'>('start')
  const [orgId, setOrgId] = useState(defaultOrg ?? firms.find((f) => f.is_platform)?.id ?? firms[0]?.id ?? '')
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [facts, setFacts] = useState<FactMap>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [reply, setReply] = useState('')
  const [replying, setReplying] = useState(false)
  const [thread, setThread] = useState<{ role: 'you' | 'overseer'; text: string }[]>([])

  // Flow is key-based (language-independent); display uses the localized copy.
  const current = useMemo(() => {
    if (phase !== 'question') return null
    const en = nextQuestion(facts)
    return en ? questions.find((q) => q.key === en.key) ?? en : null
  }, [phase, facts, questions])

  const fallbackName = locale === 'es' ? 'este negocio' : 'this business'
  const prompt = (q: Question) => q.prompt.replace('{name}', name || fallbackName)

  // The firm is fixed when onboarding was started from a firm (its menu / page):
  // no need to re-pick it. Only a platform user starting cold chooses among many.
  const locked = !!defaultOrg
  const showPicker = !locked && isPlatform && firms.length > 1
  const firmName = firms.find((f) => f.id === orgId)?.name

  // The Overseer reads the business once we reach review.
  useEffect(() => {
    if (phase !== 'review' || brief || !sessionId) return
    let live = true
    getBrief(sessionId).then((b) => {
      if (live) setBrief(b.read || b.handling ? b : null)
    })
    return () => {
      live = false
    }
  }, [phase, brief, sessionId])

  async function begin() {
    setError(null)
    if (!name.trim()) return setError(ob(locale, 'start.needName'))
    setBusy(true)
    const r = await startSession(orgId, name)
    setBusy(false)
    if ('error' in r) return setError(r.error)
    setSessionId(r.sessionId)
    setPhase('question')
  }

  async function answer(
    key: string,
    raw: string,
    normalized: unknown,
    companion?: { key: string; value: unknown }
  ) {
    setBusy(true)
    setError(null)
    await saveAnswer(sessionId, key, raw, normalized)
    let nextFacts: FactMap = { ...facts, [key]: normalized }
    if (companion) {
      await saveAnswer(sessionId, companion.key, typeof companion.value === 'string' ? companion.value : '', companion.value)
      nextFacts = { ...nextFacts, [companion.key]: companion.value }
    }
    setFacts(nextFacts)
    setBusy(false)
    if (nextQuestion(nextFacts) === null) setPhase('review')
  }

  async function sendReply() {
    const msg = reply.trim()
    if (!msg || replying) return
    setReplying(true)
    setError(null)
    setThread((t) => [...t, { role: 'you', text: msg }])
    setReply('')
    const r = await respond(sessionId, msg)
    setReplying(false)
    if ('error' in r) {
      setThread((t) => [...t, { role: 'overseer', text: r.error }])
      return
    }
    if (r.read || r.handling) setBrief({ read: r.read || brief?.read || '', handling: r.handling || brief?.handling || '' })
    if (r.facts) setFacts(r.facts)
    setThread((t) => [...t, { role: 'overseer', text: r.acknowledgment || (locale === 'es' ? 'Actualizado.' : 'Updated.') }])
  }

  async function create() {
    setBusy(true)
    setError(null)
    const r = await materialize(sessionId)
    if (r && 'error' in r) {
      setError(r.error)
      setBusy(false)
    }
    // success redirects
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      {/* Stage rail */}
      {phase !== 'start' && (
        <div className="flex items-center gap-2 mb-10 text-[11px]">
          {stageStatus(facts, current?.stage, questions, stages).map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-200">·</span>}
              <span className={s.current ? 'font-semibold text-gray-900' : s.done ? 'text-gray-400' : 'text-gray-300'}>
                {s.label}
                {s.done && !s.current ? ' ✓' : ''}
              </span>
            </div>
          ))}
          <span className="text-gray-200">·</span>
          <span className={phase === 'review' ? 'font-semibold text-gray-900' : 'text-gray-300'}>
            {ob(locale, 'stage.review')}
          </span>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Start — the name field IS the headline */}
      {phase === 'start' && (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">{ob(locale, 'start.label')}</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && begin()}
              placeholder={ob(locale, 'start.placeholder')}
              className="w-full bg-transparent border-0 border-b border-gray-200 px-0 py-2 text-4xl md:text-5xl text-gray-900 placeholder:text-gray-200 focus:border-gray-900 focus:outline-none transition-colors"
              style={{ ...serif, fontWeight: 600, letterSpacing: '-0.02em' }}
            />
          </div>

          {showPicker ? (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.18em] text-gray-400 mb-1.5">
                {ob(locale, 'start.underWhich')}
              </label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={input}>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.is_platform ? ' (Rovelo)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : firmName ? (
            <p className="text-sm text-gray-400">
              {ob(locale, 'start.under')} <span className="text-gray-700">{firmName}</span>
            </p>
          ) : null}

          <button onClick={begin} disabled={busy} className={primary}>
            {busy ? ob(locale, 'start.starting') : ob(locale, 'start.continue')}
          </button>
        </div>
      )}

      {/* Question */}
      {phase === 'question' && current && (
        <QuestionScreen key={current.key} q={current} prompt={prompt(current)} busy={busy} locale={locale} onAnswer={answer} />
      )}

      {/* Review */}
      {phase === 'review' && (
        <div className="space-y-8">
          <div>
            <p className="text-sm text-gray-400 mb-2">{ob(locale, 'review.intro', { name })}</p>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight" style={serif}>
              {ob(locale, 'review.title')}
            </h1>
          </div>

          {/* The Overseer's opening read */}
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5 space-y-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">{ob(locale, 'review.overseer')}</div>
            {!brief ? (
              <p className="text-sm text-gray-400 animate-pulse">{ob(locale, 'review.reading', { name })}</p>
            ) : (
              <>
                {brief.read && (
                  <p className="text-[15px] leading-relaxed text-gray-800" style={serif}>
                    {brief.read}
                  </p>
                )}
                {brief.handling && <p className="text-sm leading-relaxed text-gray-500">{brief.handling}</p>}
                <p className="text-sm text-gray-400 pt-1">{ob(locale, 'review.look')}</p>
              </>
            )}

            {/* Reply thread */}
            {thread.length > 0 && (
              <div className="space-y-2 pt-1">
                {thread.map((m, i) => (
                  <div key={i} className={m.role === 'you' ? 'text-right' : ''}>
                    <span
                      className={
                        m.role === 'you'
                          ? 'inline-block rounded-2xl bg-gray-100 text-gray-900 text-sm px-3.5 py-2 max-w-[85%] text-left'
                          : 'inline-block text-sm text-gray-600 leading-relaxed'
                      }
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {replying && <p className="text-xs text-gray-400 animate-pulse">{ob(locale, 'review.thinking')}</p>}
              </div>
            )}

            {/* Reply input */}
            {brief && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder={ob(locale, 'review.replyPh')}
                  disabled={replying}
                  className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white disabled:opacity-60"
                />
                <button onClick={sendReply} disabled={replying || !reply.trim()} className={primary}>
                  {ob(locale, 'review.send')}
                </button>
              </div>
            )}
          </div>

          {/* Structured facts */}
          <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {questions.map((q) => {
              // Show the specific subtype (e.g. "General Partnership (GP)") in place
              // of the core type when the operator chose an extended option.
              const s =
                q.key === 'entity_type' && facts['entity_subtype']
                  ? localizeSummary(locale, 'entity_subtype', facts['entity_subtype'])
                  : localizeSummary(locale, q.key, facts[q.key])
              if (!s) return null
              return (
                <div key={q.key} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">{stageLabel(locale, q.stage)}</div>
                  <div className="text-sm text-gray-900 text-right">{s}</div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-gray-400">{ob(locale, 'review.willSeed')}</p>
          <div className="flex items-center gap-6">
            <button onClick={create} disabled={busy} className={primary}>
              {busy ? ob(locale, 'review.creating') : ob(locale, 'review.create')}
            </button>
            <button onClick={() => setPhase('question')} className={ghost}>
              {ob(locale, 'review.back')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionScreen({
  q,
  prompt,
  busy,
  locale,
  onAnswer,
}: {
  q: Question
  prompt: string
  busy: boolean
  locale: Locale
  onAnswer: (key: string, raw: string, normalized: unknown, companion?: { key: string; value: unknown }) => void
}) {
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [text, setText] = useState('')

  // Picking any option on a question that carries a subtype taxonomy also records
  // (or clears) the specific subtype alongside the core entity type.
  const pick = (o: { value: string; label: string; subtype?: string }) =>
    onAnswer(q.key, o.label, o.value, q.moreOptions ? { key: 'entity_subtype', value: o.subtype ?? null } : undefined)
  const [date, setDate] = useState('')
  const [owners, setOwners] = useState<OwnerRow[]>(() => redistributeOwners([{ name: '', pct: null, locked: false }]))

  const setOwnerName = (i: number, name: string) =>
    setOwners((os) => os.map((o, j) => (j === i ? { ...o, name } : o)))
  const setOwnerPct = (i: number, raw: string) =>
    setOwners((os) => {
      const v = raw.trim()
      const next = os.map((o, j) =>
        j === i ? (v === '' ? { ...o, pct: null, locked: false } : { ...o, pct: clampPct(v), locked: true }) : o
      )
      return redistributeOwners(next)
    })
  const addOwner = () => setOwners((os) => redistributeOwners([...os, { name: '', pct: null, locked: false }]))
  const removeOwner = (i: number) => setOwners((os) => redistributeOwners(os.filter((_, j) => j !== i)))
  const namedOwners = owners.filter((o) => o.name.trim())
  const ownersTotal = namedOwners.reduce((s, o) => s + (o.pct ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight" style={serif}>
          {prompt}
        </h1>
        {q.help && <p className="text-sm text-gray-400 mt-2">{q.help}</p>}
      </div>

      {(q.input === 'chips' || q.input === 'chips_or_text') && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {q.options?.map((o) => (
              <button key={o.label} disabled={busy} onClick={() => pick(o)} className={chip}>
                <div className="font-medium">{o.label}</div>
                {o.hint && <div className="text-[11px] text-gray-400 mt-0.5">{o.hint}</div>}
              </button>
            ))}
          </div>

          {/* Extended taxonomy behind a quiet toggle */}
          {q.moreOptions && q.moreOptions.length > 0 && (
            showMore ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {q.moreOptions.map((o) => (
                  <button key={o.label} disabled={busy} onClick={() => pick(o)} className={chip}>
                    <div className="font-medium">{o.label}</div>
                    {o.hint && <div className="text-[11px] text-gray-400 mt-0.5">{o.hint}</div>}
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => setShowMore(true)} className={`${ghost} pt-1`}>
                {ob(locale, 'q.more')}
              </button>
            )
          )}

          {q.input === 'chips_or_text' &&
            (showCustom ? (
              <div className="flex items-center gap-3 pt-1">
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && custom.trim() && onAnswer(q.key, custom.trim(), custom.trim())}
                  placeholder={ob(locale, 'q.typeAnswer')}
                  className={input}
                />
                <button disabled={busy || !custom.trim()} onClick={() => onAnswer(q.key, custom.trim(), custom.trim())} className={primary}>
                  {ob(locale, 'q.save')}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(true)} className={`${ghost} pt-1`}>
                {ob(locale, 'q.somethingElse')}
              </button>
            ))}
        </div>
      )}

      {q.input === 'text' && (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={ob(locale, 'q.typeAnswer')}
            className={input}
          />
          <div className="flex items-center gap-6">
            <button disabled={busy || (!q.optional && !text.trim())} onClick={() => onAnswer(q.key, text.trim(), text.trim())} className={primary}>
              {ob(locale, 'q.continue')}
            </button>
            {q.optional && (
              <button onClick={() => onAnswer(q.key, '', null)} className={ghost}>
                {ob(locale, 'q.skip')}
              </button>
            )}
          </div>
        </div>
      )}

      {q.input === 'date' && (
        <div className="space-y-3">
          <input
            autoFocus
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${input} max-w-xs`}
          />
          <div className="flex items-center gap-6">
            <button disabled={busy} onClick={() => onAnswer(q.key, date, date || null)} className={primary}>
              {ob(locale, 'q.continue')}
            </button>
            {q.optional && (
              <button onClick={() => onAnswer(q.key, '', null)} className={ghost}>
                {ob(locale, 'q.skip')}
              </button>
            )}
          </div>
        </div>
      )}

      {q.input === 'owners' && (
        <div className="space-y-3">
          <div className="space-y-2">
            {owners.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  autoFocus={i === 0}
                  value={o.name}
                  onChange={(e) => setOwnerName(i, e.target.value)}
                  placeholder={i === 0 ? ob(locale, 'owners.name') : ob(locale, 'owners.add')}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
                <div className="relative w-24 shrink-0">
                  <input
                    value={o.pct ?? ''}
                    onChange={(e) => setOwnerPct(i, e.target.value)}
                    inputMode="numeric"
                    aria-label={ob(locale, 'owners.pctAria')}
                    className={`w-full border rounded-xl pl-4 pr-7 py-3 text-base text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white ${o.locked ? 'border-gray-300' : 'border-gray-200 text-gray-500'}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                </div>
                {owners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOwner(i)}
                    aria-label="Remove owner"
                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <button onClick={addOwner} className={ghost}>
              {ob(locale, 'owners.addAnother')}
            </button>
            {namedOwners.length > 0 && (
              <span className={`text-xs ${ownersTotal === 100 ? 'text-gray-400' : 'text-amber-600'}`}>
                {ob(locale, 'owners.total', { n: ownersTotal })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400">{ob(locale, 'owners.hint')}</p>
          <div className="flex items-center gap-6 pt-1">
            <button
              disabled={busy}
              onClick={() =>
                onAnswer(q.key, '', namedOwners.map((o) => ({ name: o.name.trim(), pct: o.pct }) as Owner))
              }
              className={primary}
            >
              {ob(locale, 'q.continue')}
            </button>
            <button onClick={() => onAnswer(q.key, '', [])} className={ghost}>
              {ob(locale, 'q.skip')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
