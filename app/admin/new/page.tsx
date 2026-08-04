import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { createClientAccount } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'New client — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function NewClient({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All clients
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">Onboard a new client</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          Creates the client and their read-only login in one step.
        </p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={createClientAccount} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Business
            </legend>
            <Field name="name" label="Business name" required placeholder="Acme Auto LLC" />
            <Field
              name="slug"
              label="URL slug"
              hint="Optional — used in the address bar. Leave blank to auto-generate from the name."
              placeholder="acme-auto"
            />
            <Field name="owner" label="Owner name" placeholder="Jane Doe" />
            <Field name="address" label="Address" placeholder="123 Main St, San Diego, CA" />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Client login
            </legend>
            <Field
              name="email"
              label="Login email"
              type="email"
              required
              placeholder="owner@acme.com"
              hint="We'll email them a secure, single-use link to set their own password."
            />
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 transition-colors"
            >
              Create client &amp; send invite
            </button>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required,
  hint,
  placeholder,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  hint?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
