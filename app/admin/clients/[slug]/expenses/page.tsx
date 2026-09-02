import { redirect } from 'next/navigation'

// This tab moved under the tax-year path (/[slug]/[year]/expenses).
// Old links land here and bounce to the year picker.
export default function MovedTab({ params }: { params: { slug: string } }) {
  redirect(`/admin/clients/${params.slug}`)
}
