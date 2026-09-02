'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseDocument, parseDocumentText } from '@/lib/ai'
import { PERMANENT_FOLDER, AGENCY_FOLDER } from '@/lib/folders'
import { DOCUMENT_TYPE_LABELS } from '@/lib/types'
import { recomputeAndPersist } from '@/lib/entityStateServer'
import { ingestExtractedFields } from '@/lib/reviewServer'
import { logEvent } from '@/lib/registryServer'
import { entityBase } from '@/lib/entityYear'
import type { ParsedDoc } from '@/lib/ai'

const LOG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A first-person, contextual registry line for a document the Overseer just read —
// it names what the doc is and the period it covers, and carries the Overseer's
// own one-line understanding of it (reused from the extraction, no extra tokens).
function documentReceivedLine(parsed: ParsedDoc, fallbackName: string): { title: string; detail: string | null } {
  const y = parsed.period_year
  const period = y ? (parsed.period_month ? `${LOG_MONTHS[parsed.period_month - 1]} ${y}` : `${y}`) : null
  const dt = parsed.document_type
  const label = (dt && DOCUMENT_TYPE_LABELS[dt as keyof typeof DOCUMENT_TYPE_LABELS])?.toLowerCase() ?? 'document'
  const detail = parsed.summary ? parsed.summary.slice(0, 180) : null

  let title: string
  if (dt === 'bank_statement') title = period ? `Received the bank statement for ${period}.` : 'Received a bank statement.'
  else if (dt === 'agency_notice')
    title = `Received a notice from ${parsed.agency ? parsed.agency.toUpperCase() : 'a tax agency'}.`
  else if (dt === 'ein_letter') title = 'Received the EIN letter (CP-575).'
  else if (period) title = `Received ${parsed.title ?? label} for ${period}.`
  else title = `Received ${parsed.title ?? `a ${label}`}.`
  return { title, detail }
}

const BUCKET = 'client-docs'

function imgMime(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

// Convert an xls/xlsx/csv workbook (as bytes) to CSV-ish text for the parser.
function spreadsheetToText(buf: ArrayBuffer): string {
  const wb = XLSX.read(buf, { type: 'array' })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    parts.push(`# Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
  }
  return parts.join('\n\n')
}

// Route a parsed document to its filing destination.
// permanent / agency_notices have no period; source categories carry year+month.
function routeOf(category: string | null, year: number | null, month: number | null) {
  if (category === PERMANENT_FOLDER || category === 'permanent') {
    return { folder: PERMANENT_FOLDER, period_year: null, period_month: null }
  }
  if (category === AGENCY_FOLDER || category === 'agency_notices') {
    return { folder: AGENCY_FOLDER, period_year: null, period_month: null }
  }
  return { folder: category ?? 'other', period_year: year, period_month: month }
}

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

const MAX_PARSE_BYTES = 12 * 1024 * 1024 // 12MB — PDFs/images (fetched by the AI, not loaded here)
const MAX_SHEET_BYTES = 6 * 1024 * 1024 // 6MB — spreadsheets are parsed in-Worker (memory-heavy)

// Parse an already-uploaded document row: download, run AI, store results.
export async function parseUploadedDoc(slug: string, docId: string, autofile = false) {
  const supabase = await admin()
  const { data: doc } = await supabase
    .from('documents')
    .select('id, client_id, name, storage_path, content_type, size_bytes')
    .eq('id', docId)
    .single()
  if (!doc) return

  async function fail(msg: string) {
    await supabase
      .from('documents')
      .update({ ai_status: 'failed', ai_summary: msg.slice(0, 400) })
      .eq('id', docId)
    revalidatePath(`${entityBase(slug)}/compliance`)
  }

  const media = doc.content_type || ''
  const name = doc.name || doc.storage_path || ''
  const ext = (name.split('.').pop() || '').toLowerCase()

  const isPdf = media === 'application/pdf' || ext === 'pdf'
  const isImg = media.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
  const isSheet = ['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(ext) || /sheet|excel|csv/.test(media)
  const isText = media.startsWith('text/') || ['txt', 'md'].includes(ext)

  if (!isPdf && !isImg && !isSheet && !isText) {
    return fail(`Can't auto-read this file type (${media || ext || 'unknown'}). It's stored — move it manually.`)
  }
  if ((doc.size_bytes ?? 0) > MAX_PARSE_BYTES) return fail('File is too large to auto-read (over 12MB).')
  if (isSheet && (doc.size_bytes ?? 0) > MAX_SHEET_BYTES) {
    return fail("Spreadsheet is too large to auto-read (over 6MB). It's stored — move it manually.")
  }

  await supabase.from('documents').update({ ai_status: 'pending' }).eq('id', docId)

  try {
    let parsed
    if (isPdf || isImg) {
      // Hand the AI a short-lived signed URL and let it fetch the file itself —
      // the Worker never loads the bytes, avoiding the 128MB memory limit (1102).
      const mt = isPdf ? 'application/pdf' : media.startsWith('image/') ? media : imgMime(ext)
      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, 300)
      if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || 'Could not create a link to the file for parsing.')
      parsed = await parseDocument({ mediaType: mt, url: signed.signedUrl })
    } else if (isSheet) {
      const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(doc.storage_path)
      if (dErr || !blob) throw new Error(dErr?.message || 'Could not download file for parsing.')
      const text = spreadsheetToText(await blob.arrayBuffer())
      if (!text.trim()) throw new Error('No readable rows found in the spreadsheet.')
      parsed = await parseDocumentText(text)
    } else {
      const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(doc.storage_path)
      if (dErr || !blob) throw new Error(dErr?.message || 'Could not download file for parsing.')
      const text = new TextDecoder().decode(await blob.arrayBuffer())
      if (!text.trim()) throw new Error('File appears to be empty.')
      parsed = await parseDocumentText(text)
    }

    const base: Record<string, unknown> = {
      ai_status: 'parsed',
      ai_title: parsed.title,
      ai_summary: parsed.summary,
      ai_tags: parsed.tags,
      ai_fields: parsed.entity_fields,
      ai_field_confidence: parsed.field_confidence,
      doc_type: parsed.document_type ?? 'other',
      agency: parsed.agency,
      issued_date: parsed.issue_date,
      expires_date: parsed.expires_date,
    }

    if (autofile) {
      const route = routeOf(parsed.folder_category, parsed.period_year, parsed.period_month)
      Object.assign(base, route)
      if (route.period_year != null) {
        await supabase
          .from('document_years')
          .upsert({ client_id: doc.client_id, year: route.period_year }, { onConflict: 'client_id,year' })
      }
    }

    await supabase.from('documents').update(base).eq('id', docId)

    const line = documentReceivedLine(parsed, doc.name ?? 'a document')
    await logEvent(supabase, doc.client_id as string, {
      kind: 'document',
      source: 'overseer',
      title: line.title,
      detail: line.detail,
      meta: { doc_id: docId },
    })
  } catch (e) {
    return fail(`Parse failed: ${e instanceof Error ? e.message : 'unknown error'}`)
  }

  // Trust layer: route the extracted identity fields through the confidence/
  // provenance rules — high-confidence writes into empty fields flow through,
  // anything risky (low confidence, conflicts, or overwriting a verified value)
  // is escalated to the review queue instead of applied blindly.
  try {
    await ingestExtractedFields(supabase, doc.client_id as string, docId)
  } catch {
    // ingestion is best-effort — never break the parse
  }

  // Orchestrator: a new document just landed and got filed — refresh the
  // entity's readiness picture (document completeness, last-evidence) hands-free.
  await recomputeAndPersist(supabase, doc.client_id as string)

  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(`${entityBase(slug)}/documents`)
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(entityBase(slug))
}

// Apply the AI-proposed entity fields from a document — through the same trust
// rules as the automatic path: safe fields write through, risky ones queue.
export async function applyExtractedFields(slug: string, docId: string) {
  const supabase = await admin()
  const { data: doc } = await supabase.from('documents').select('client_id').eq('id', docId).single()
  if (!doc) return

  await ingestExtractedFields(supabase, doc.client_id as string, docId)
  await recomputeAndPersist(supabase, doc.client_id as string)

  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(entityBase(slug))
}

// Relocate a document to a chosen destination (manual override of the AI's filing).
export async function moveDocument(
  slug: string,
  docId: string,
  folder: string,
  year: number | null,
  month: number | null
) {
  const supabase = await admin()
  const { data: doc } = await supabase.from('documents').select('client_id').eq('id', docId).single()
  if (!doc) return

  const route = routeOf(folder, year, month)
  await supabase
    .from('documents')
    .update({ folder: route.folder, period_year: route.period_year, period_month: route.period_month })
    .eq('id', docId)

  if (route.period_year != null) {
    await supabase
      .from('document_years')
      .upsert({ client_id: doc.client_id, year: route.period_year }, { onConflict: 'client_id,year' })
  }

  revalidatePath(`${entityBase(slug)}/documents`)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(`/admin/clients/${slug}/account`)
}
