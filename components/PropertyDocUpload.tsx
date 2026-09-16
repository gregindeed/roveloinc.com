'use client'

import { useRef, useState } from 'react'
import { DOC_KIND_LABELS, type DocKind } from '@/lib/property'

const selectCls =
  'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

// A compact "Upload …" button. Clicking opens the native file picker; choosing a
// file uploads it immediately through the given server action. No dropzone, no
// unit picker. For documents an optional Kind select sits beside the button.
export default function PropertyDocUpload({
  action,
  lockKind,
  excludeKinds,
  label = 'Upload',
}: {
  action: (formData: FormData) => void | Promise<void>
  // Force this doc kind and hide the picker — e.g. photos in the Gallery.
  lockKind?: DocKind
  // Kinds to leave out of the picker — e.g. hide 'photo' in the Documents tab.
  excludeKinds?: DocKind[]
  label?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const kindOptions = (Object.keys(DOC_KIND_LABELS) as DocKind[]).filter((k) => !(excludeKinds ?? []).includes(k))
  const defaultKind = kindOptions.includes('lease_agreement') ? 'lease_agreement' : kindOptions[0]

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return
    if (files[0].size > 15 * 1024 * 1024) {
      setError('That file is over 15MB — pick a smaller one.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setError(null)
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-3">
      {lockKind ? (
        <input type="hidden" name="doc_kind" value={lockKind} />
      ) : (
        <select name="doc_kind" defaultValue={defaultKind} className={selectCls} aria-label="Document type">
          {kindOptions.map((k) => (
            <option key={k} value={k}>{DOC_KIND_LABELS[k]}</option>
          ))}
        </select>
      )}

      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={lockKind === 'photo' ? 'image/*' : undefined}
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-900 hover:bg-gray-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {label}
      </button>

      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </form>
  )
}
