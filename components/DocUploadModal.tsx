'use client'

import { useEffect, useRef, useState } from 'react'

// A subtle "+ Upload document" link that opens a modal: drag-and-drop (or browse)
// a file and it uploads. The Overseer reads it, files it under the right type,
// and books any expense it finds — no manual category needed.
export default function DocUploadModal({
  action,
  label = '+ Upload document',
}: {
  action: (formData: FormData) => void | Promise<void>
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy])

  function take(files: FileList | null) {
    if (!files || files.length === 0) return
    const f = files[0]
    if (f.size > 15 * 1024 * 1024) {
      setError('That file is over 15MB — pick a smaller one.')
      return
    }
    if (inputRef.current) {
      const dt = new DataTransfer()
      dt.items.add(f)
      inputRef.current.files = dt.files
    }
    setName(f.name)
    setError(null)
    setBusy(true)
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900">
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Upload document</h3>
              <button type="button" onClick={() => !busy && setOpen(false)} aria-label="Close" className="text-sm text-gray-400 hover:text-gray-900">
                ✕
              </button>
            </div>

            <form ref={formRef} action={action} className="mt-4">
              {/* Overseer reads every uploaded document (classifies + books expenses). */}
              <input type="hidden" name="overseer_read" value="on" />
              <input ref={inputRef} type="file" name="file" accept=".pdf,image/*" className="hidden" onChange={(e) => take(e.target.files)} />
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  take(e.dataTransfer.files)
                }}
                onClick={() => !busy && inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!busy && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
                  drag ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                {busy ? (
                  <p className="text-sm text-gray-600">Uploading{name ? ` ${name}` : ''} — the Overseer is reading it…</p>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4M7 9l5-5 5 5" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <p className="text-sm text-gray-600">
                      Drag a file here, or <span className="font-medium text-gray-900">click to browse</span>
                    </p>
                    <p className="text-[11px] text-gray-400">PDF or image. Max 15MB.</p>
                  </>
                )}
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                The Overseer reads each document, files it under the right type, and books any bill it finds to the P&amp;L.
              </p>
              {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
