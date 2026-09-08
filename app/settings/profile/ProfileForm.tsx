'use client'

import { useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import { useT } from '@/components/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from './actions'

const input =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
const primary =
  'inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-400 disabled:opacity-40 transition-colors'

export default function ProfileForm({
  userId,
  email,
  initialName,
  initialHandle,
  avatarUrl,
}: {
  userId: string
  email: string | null
  initialName: string | null
  initialHandle: string | null
  avatarUrl: string | null
}) {
  const t = useT()
  const supabase = createClient()
  const [name, setName] = useState(initialName ?? '')
  const [handle, setHandle] = useState(initialHandle ?? '')
  const [url, setUrl] = useState(avatarUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(file: File) {
    setErr(null)
    if (!file.type.startsWith('image/')) {
      setErr(t('profile.photoType'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr(t('profile.photoSize'))
      return
    }
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${userId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust so the new photo shows immediately.
      setUrl(`${data.publicUrl}?v=${Date.now()}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('profile.photoFailed'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const cleanHandle = handle.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '')

  return (
    <form action={updateProfile} className="space-y-7">
      <input type="hidden" name="avatar_url" value={url} />

      {/* Avatar + upload */}
      <div className="flex items-center gap-4">
        <Avatar name={name || email} email={email} url={url || null} size={64} />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-40"
            >
              {uploading ? t('profile.uploading') : t('profile.uploadPhoto')}
            </button>
            {url && (
              <button type="button" onClick={() => setUrl('')} className="text-xs text-gray-400 hover:text-red-600">
                {t('profile.removePhoto')}
              </button>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{t('profile.photoHint')}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div>
        <label htmlFor="display_name" className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 mb-1.5">
          {t('profile.displayName')}
        </label>
        <input
          id="display_name"
          name="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('profile.namePlaceholder')}
          maxLength={80}
          className={input}
        />
      </div>

      <div>
        <label htmlFor="handle" className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 mb-1.5">
          {t('profile.handle')}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-gray-400">@</span>
          <input
            id="handle"
            name="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="milena"
            maxLength={30}
            className={`${input} pl-8`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {t('profile.handleHint')} {cleanHandle && <span className="text-gray-600">@{cleanHandle}</span>}
        </p>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 mb-1.5">{t('profile.email')}</label>
        <div className="text-sm text-gray-500">{email ?? '—'}</div>
      </div>

      <button type="submit" disabled={uploading} className={primary}>
        {t('common.save')} →
      </button>
    </form>
  )
}
