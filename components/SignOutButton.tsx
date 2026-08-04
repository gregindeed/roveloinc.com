import { signOut } from '@/app/login/actions'

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}
