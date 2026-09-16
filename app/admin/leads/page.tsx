import { redirect } from 'next/navigation'

// Leads now live inline on the dashboard as the third tab. This route stays only
// to catch old links and send them there.
export const dynamic = 'force-dynamic'

export default function LeadsRedirect() {
  redirect('/admin?tab=leads')
}
