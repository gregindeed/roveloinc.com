import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

// The classic single-page onboarding form is retired — all onboarding now flows
// through the guided interview (which handles both businesses and individuals).
// This URL is kept as a permanent funnel so any old link or bookmark lands in
// the guided flow. The classic form component + action stay in the repo, dormant,
// as a fallback we can re-enable in seconds if ever needed.
export default function NewClientRedirect({ searchParams }: { searchParams: { org?: string } }) {
  redirect(searchParams.org ? `/admin/new/guided?org=${searchParams.org}` : '/admin/new/guided')
}
