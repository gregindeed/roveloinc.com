'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { useT } from '@/components/I18nProvider'
import { updateProfile } from './actions'

const input =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
const primary =
  'inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-400 disabled:opacity-40 transition-colors'

export default function ProfileForm({
  email,
  initialName,
  avatarUrl,
}: {
  email: string | null
  initialName: string | null
  avatarUrl: string | null
}) {
  const t = useT()
  const [name, setName] = useState(initialName ?? '')

  return (
    <form action={updateProfile} className="space-y-7">
      {/* Live monogram preview */}
      <div className="flex items-center gap-4">
        <Avatar name={name || email} email={email} url={avatarUrl} size={56} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{name.trim() || email || t('profile.you')}</div>
          <div className="text-xs text-gray-400">{t('profile.appearHint')}</div>
        </div>
      </div>

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
        <label className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 mb-1.5">{t('profile.email')}</label>
        <div className="text-sm text-gray-500">{email ?? '—'}</div>
      </div>

      <button type="submit" className={primary}>
        {t('common.save')} →
      </button>
    </form>
  )
}
