import { addRegistryNote, togglePin, deleteRegistryEntry } from '@/app/admin/clients/[slug]/registry-actions'
import type { EntityLogEntry } from '@/lib/types'

const when = (iso: string) => {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    year: d.getFullYear(),
  }
}

const sourceLabel = (e: EntityLogEntry) =>
  e.source === 'overseer' ? 'Overseer' : e.source === 'system' ? 'System' : e.actor

// Restrained: one muted accent for the Overseer, gray for everything else.
const sourceDot = (e: EntityLogEntry) =>
  e.source === 'overseer' ? 'bg-violet-400' : e.source === 'operator' ? 'bg-gray-800' : 'bg-gray-300'

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M5 9l1.5 6h11L19 9" />
      <path d="M4 9h16l-2-4H6L4 9z" />
    </svg>
  )
}

export default function RegistryPanel({ slug, entries }: { slug: string; entries: EntityLogEntry[] }) {
  const facts = entries.filter((e) => e.pinned)
  const history = entries.filter((e) => !e.pinned)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">System Registry</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          The acknowledged record of this entity — its history and standing facts. The Overseer reads the pinned facts and
          recent history as ground truth.
        </p>
      </div>

      {/* Standing facts */}
      {facts.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Standing facts</div>
          <div className="space-y-1.5">
            {facts.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm text-gray-800">
                  <span className="text-gray-900">{e.title}</span>
                  {e.detail && <span className="text-gray-500"> — {e.detail}</span>}
                </div>
                <div className="shrink-0 flex items-center gap-1 text-gray-300">
                  <form action={togglePin.bind(null, slug, e.id)}>
                    <button title="Unpin" className="p-1 hover:text-gray-700">
                      <PinIcon filled />
                    </button>
                  </form>
                  {e.source === 'operator' && (
                    <form action={deleteRegistryEntry.bind(null, slug, e.id)}>
                      <button title="Remove" className="p-1 hover:text-red-600 text-[11px]">✕</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add a note / fact */}
      <form action={addRegistryNote.bind(null, slug)} className="rounded-xl border border-gray-200 p-3">
        <input
          name="text"
          required
          placeholder="Add a note or a standing fact (e.g. “$1,200 CDTFA penalty in 2024”)…"
          className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <input type="checkbox" name="pinned" className="accent-gray-800" /> Pin as a standing fact
          </label>
          <button className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">
            Add
          </button>
        </div>
      </form>

      {/* History */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">History</div>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400">No entries yet.</p>
        ) : (
          <div className="space-y-0">
            {history.map((e) => {
              const w = when(e.at)
              return (
                <div key={e.id} className="group flex gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="shrink-0 w-14 text-right">
                    <div className="text-[11px] text-gray-500 tabular-nums">{w.date}</div>
                    <div className="text-[10px] text-gray-300 tabular-nums">{w.year}</div>
                  </div>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sourceDot(e)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-gray-900">{e.title}</div>
                    {e.detail && <div className="text-[11px] text-gray-500">{e.detail}</div>}
                    <div className="text-[10px] text-gray-400">{sourceLabel(e)}</div>
                  </div>
                  <form action={togglePin.bind(null, slug, e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Pin as standing fact" className="p-1 text-gray-300 hover:text-gray-700">
                      <PinIcon filled={false} />
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
