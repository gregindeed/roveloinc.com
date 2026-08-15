'use client'

import { signOut } from '@/app/login/actions'
import { useT } from './I18nProvider'

export default function SignOutButton() {
  const t = useT()
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        {t('nav.signOut')}
      </button>
    </form>
  )
}
