import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanel from '@/components/DocumentsPanel'
import FolderCard from '@/components/FolderCard'
import { DOC_CATEGORIES, MONTHS, categoryLabel, monthLabel } from '@/lib/folders'

const SPECIAL_FOLDERS = ['permanent', 'agency_notices']
import type { DocumentRow } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

function Banner({ ok, warn }: { ok?: string; warn?: string }) {
  return (
    <>
      {ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{ok}</div>
      )}
      {warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{warn}</div>
      )}
    </>
  )
}

function Crumbs({ base, parts }: { base: string; parts: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500">
      <Link href={base} className="hover:text-gray-900">Documents &amp; Sources</Link>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-gray-300">/</span>
          {p.href ? (
            <Link href={p.href} className="hover:text-gray-900">{p.label}</Link>
          ) : (
            <span className="text-gray-900 font-medium">{p.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

const grid = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: { slug: string; year: string }
  searchParams: { year?: string; folder?: string; month?: string; ok?: string; warn?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const base = `/admin/clients/${client.slug}/${params.year}/documents`
  const yearParam = searchParams.year ?? null
  const folderParam = searchParams.folder ?? null
  const monthParam = searchParams.month ?? null

  if (yearParam) {
    const unfiled = yearParam === 'unfiled'
    const year = unfiled ? null : parseInt(yearParam, 10)
    const yearHref = `${base}?year=${year}`
    const folderHref = `${yearHref}&folder=${folderParam}`

    // ---------- Unfiled bucket: source docs with no period yet ----------
    if (unfiled) {
      const { data: docsRaw } = await supabase
        .from('documents')
        .select('*')
        .eq('client_id', client.id)
        .is('period_year', null)
        .order('created_at', { ascending: false })
      // Permanent + agency docs also have no year but live on their own tabs.
      const documents = (docsRaw ?? []).filter((d) => !SPECIAL_FOLDERS.includes(d.folder ?? ''))
      return (
        <div className="space-y-5">
          <Banner ok={searchParams.ok} warn={searchParams.warn} />
          <Crumbs base={base} parts={[{ label: 'Unfiled' }]} />
          <DocumentsPanel
            clientId={client.id}
            currentUserId={user!.id}
            isAdmin={true}
            initialDocs={(documents ?? []) as DocumentRow[]}
            title="Unfiled documents"
            unfiledTop={true}
            allowUpload={false}
          />
        </div>
      )
    }

    // ---------- STATE D: files inside a month (or Unsorted) ----------
    if (folderParam && monthParam) {
      const unsorted = monthParam === 'none'
      const month = unsorted ? null : parseInt(monthParam, 10)

      let q = supabase
        .from('documents')
        .select('*')
        .eq('client_id', client.id)
        .eq('period_year', year!)
        .eq('folder', folderParam)
      q = unsorted ? q.is('period_month', null) : q.eq('period_month', month!)
      const { data: documents } = await q.order('created_at', { ascending: false })

      const mLabel = unsorted ? 'Unsorted' : monthLabel(month)
      return (
        <div className="space-y-5">
          <Banner ok={searchParams.ok} warn={searchParams.warn} />
          <Crumbs
            base={base}
            parts={[
              { label: String(year), href: yearHref },
              { label: categoryLabel(folderParam), href: folderHref },
              { label: mLabel },
            ]}
          />
          <DocumentsPanel
            clientId={client.id}
            currentUserId={user!.id}
            isAdmin={true}
            initialDocs={(documents ?? []) as DocumentRow[]}
            title={`${categoryLabel(folderParam)} · ${mLabel} ${year}`}
            year={year}
            folder={folderParam}
            month={month}
            nullMonth={unsorted}
          />
        </div>
      )
    }

    // ---------- STATE C: category open, choose a month ----------
    if (folderParam) {
      const { data: folderDocs } = await supabase
        .from('documents')
        .select('period_month')
        .eq('client_id', client.id)
        .eq('period_year', year!)
        .eq('folder', folderParam)
      const byMonth: Record<number, number> = {}
      let unsortedCount = 0
      for (const d of folderDocs ?? []) {
        if (d.period_month == null) unsortedCount++
        else byMonth[d.period_month] = (byMonth[d.period_month] ?? 0) + 1
      }

      return (
        <div className="space-y-6">
          <Banner ok={searchParams.ok} warn={searchParams.warn} />
          <Crumbs base={base} parts={[{ label: String(year), href: yearHref }, { label: categoryLabel(folderParam) }]} />
          <div className="grid grid-cols-3 gap-3">
            {MONTHS.map((m) => (
              <FolderCard key={m.n} href={`${folderHref}&month=${m.n}`} label={m.label} count={byMonth[m.n] ?? 0} />
            ))}
            <FolderCard href={`${folderHref}&month=none`} label="Unsorted" count={unsortedCount} muted />
          </div>
        </div>
      )
    }

    // ---------- STATE B: year open, choose a category ----------
    const { data: yearDocs } = await supabase
      .from('documents')
      .select('folder')
      .eq('client_id', client.id)
      .eq('period_year', year!)
    const counts: Record<string, number> = {}
    for (const d of yearDocs ?? []) counts[d.folder ?? 'other'] = (counts[d.folder ?? 'other'] ?? 0) + 1

    return (
      <div className="space-y-5">
        <Banner ok={searchParams.ok} warn={searchParams.warn} />
        <Crumbs base={base} parts={[{ label: String(year) }]} />
        <div className={grid}>
          {DOC_CATEGORIES.map((c) => (
            <FolderCard key={c.slug} href={`${yearHref}&folder=${c.slug}`} label={c.label} count={counts[c.slug] ?? 0} />
          ))}
        </div>
      </div>
    )
  }

  // ---------- STATE A: root — year folders ----------
  const [{ data: years }, { data: allDocs }] = await Promise.all([
    supabase.from('document_years').select('year').eq('client_id', client.id).order('year', { ascending: false }),
    supabase.from('documents').select('period_year, folder').eq('client_id', client.id),
  ])

  const yearSet = new Set<number>((years ?? []).map((y) => y.year))
  for (const d of allDocs ?? []) if (d.period_year != null) yearSet.add(d.period_year)
  const yearList = Array.from(yearSet).sort((a, b) => b - a)

  const countByYear: Record<number, number> = {}
  let unfiledCount = 0
  for (const d of allDocs ?? []) {
    if (SPECIAL_FOLDERS.includes(d.folder ?? '')) continue // permanent/agency live elsewhere
    if (d.period_year == null) unfiledCount++
    else countByYear[d.period_year] = (countByYear[d.period_year] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <Banner ok={searchParams.ok} warn={searchParams.warn} />

      {yearList.length === 0 && unfiledCount === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          No documents yet. Use <span className="font-medium text-gray-700">Add files</span> up top and the Overseer will
          file them here automatically.
        </div>
      ) : (
        <div className={grid}>
          {yearList.map((y) => (
            <FolderCard key={y} href={`${base}?year=${y}`} label={String(y)} count={countByYear[y] ?? 0} />
          ))}
          {unfiledCount > 0 && (
            <FolderCard href={`${base}?year=unfiled`} label="Unfiled" count={unfiledCount} muted />
          )}
        </div>
      )}
    </div>
  )
}
