import { redirect } from 'next/navigation'

// The importer is now a global tool at /admin/import. This route stays only to
// catch old links and send them there.
export const dynamic = 'force-dynamic'

export default function LeadsImportRedirect() {
  redirect('/admin/import')
}
