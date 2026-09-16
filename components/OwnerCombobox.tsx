'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Owner = { id: string; name: string; owner_name: string | null; kind: string | null }

const detail = (c: Owner) =>
  [c.owner_name || null, c.kind === 'individual' ? 'individual' : null].filter(Boolean).join(' · ')

// A typeahead owner picker that replaces the old dropdown + "Owner not listed?"
// section. Type to filter existing owners; if nothing matches, offer to add a
// new one inline. The chosen owner is fed to the property form (by id) through
// a hidden input associated via the HTML `form` attribute — so this component
// can live outside that form and its own "add owner" form never nests inside it.
export default function OwnerCombobox({
  clients,
  canCreateOwner,
  preselectId,
  createOwner,
  formId,
  labelClassName,
  inputClassName,
}: {
  clients: Owner[]
  canCreateOwner: boolean
  preselectId: string
  createOwner: (formData: FormData) => void | Promise<void>
  formId: string
  labelClassName: string
  inputClassName: string
}) {
  const preselect = clients.find((c) => c.id === preselectId) ?? null
  const [query, setQuery] = useState(preselect?.name ?? '')
  const [selected, setSelected] = useState<Owner | null>(preselect)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return clients
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.owner_name ?? '').toLowerCase().includes(q)
    )
  }, [clients, q])

  const exact = clients.some((c) => c.name.toLowerCase() === q)
  const showAdd = canCreateOwner && q.length > 0 && !exact

  function pick(c: Owner) {
    setSelected(c)
    setQuery(c.name)
    setOpen(false)
    setAdding(false)
  }

  function onType(v: string) {
    setQuery(v)
    setSelected(null) // typing clears any prior selection
    setOpen(true)
    setAdding(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className={labelClassName} htmlFor="owner_search">Owner (landlord entity)</label>

      {/* The value that actually submits with the property form. */}
      <input type="hidden" name="client_id" value={selected?.id ?? ''} form={formId} />

      <div className="relative">
        <input
          id="owner_search"
          type="text"
          autoComplete="off"
          value={query}
          placeholder="Type an owner's name…"
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          className={`${inputClassName} ${selected ? 'pr-9' : ''}`}
          aria-expanded={open}
          role="combobox"
          aria-controls="owner_listbox"
        />
        {selected && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-green-600" aria-label="Owner selected">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        )}
      </div>

      {open && !adding && (
        <div
          id="owner_listbox"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={selected?.id === c.id}
              onClick={() => pick(c)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="truncate text-gray-900">{c.name}</span>
              {detail(c) && <span className="shrink-0 text-[11px] text-gray-400">{detail(c)}</span>}
            </button>
          ))}

          {matches.length === 0 && !showAdd && (
            <p className="px-3 py-2 text-sm text-gray-500">
              {canCreateOwner ? 'No matches — keep typing to add a new owner.' : 'No matching owner. Ask an admin to add one.'}
            </p>
          )}

          {showAdd && (
            <button
              type="button"
              onClick={() => {
                setAdding(true)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add “{query.trim()}” as a new owner
            </button>
          )}
        </div>
      )}

      {/* Inline "create owner" — its own form, so it posts to createOwner and
          on success reloads with ?owner=<id>, which preselects it here. */}
      {adding && (
        <form action={createOwner} className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-dashed border-gray-200 p-4">
          <div className="col-span-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-gray-700">New owner</p>
            <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-gray-400 hover:text-gray-700">
              Cancel
            </button>
          </div>
          <div className="col-span-2">
            <label className={labelClassName} htmlFor="owner_new_name">Owner / entity name</label>
            <input
              id="owner_new_name"
              name="name"
              required
              defaultValue={query.trim()}
              placeholder="Rovelo Holdings LLC"
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor="owner_new_kind">Type</label>
            <select id="owner_new_kind" name="kind" className={inputClassName} defaultValue="business">
              <option value="business">Business</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div>
            <label className={labelClassName} htmlFor="owner_new_contact">Contact / owner name</label>
            <input id="owner_new_contact" name="owner_name" placeholder="optional" className={inputClassName} />
          </div>
          <div className="col-span-2">
            <button type="submit" className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700">
              Add owner &amp; select
            </button>
            <span className="ml-3 text-[11px] text-gray-400">Creates a real entity — it also appears in your clients roster.</span>
          </div>
        </form>
      )}

      {!canCreateOwner && clients.length === 0 && (
        <p className="mt-1 text-[11px] text-gray-400">No owner entities yet. Ask an admin to add one.</p>
      )}
    </div>
  )
}
