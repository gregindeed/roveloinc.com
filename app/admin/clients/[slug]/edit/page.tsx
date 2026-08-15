import { redirect } from 'next/navigation'

// The profile is now edited inline under Entity settings → Profile.
// This route redirects there so old links / bookmarks still work.
export default function EditRedirect({ params }: { params: { slug: string } }) {
  redirect(`/admin/clients/${params.slug}/account`)
}
