import AuthHeader from '@/components/AuthHeader'
import { getViewer } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Minimal shell shared by the year picker, the year workspace, and entity-level
// settings pages. The entity chrome (title, tabs) lives in the [year] layout.
export default async function ClientShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={viewer?.email} settingsHref={viewer?.isOwner ? '/admin/team' : null} />
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
