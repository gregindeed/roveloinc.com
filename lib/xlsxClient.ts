// Browser-only spreadsheet → text conversion.
//
// XLSX parsing (SheetJS) is memory- and CPU-heavy. Running it inside the
// Cloudflare Worker blew the fixed 128MB memory / CPU limits on real workbooks
// and returned Cloudflare error 1102 ("Worker exceeded resource limits"). The
// browser has no such limit, so we convert here and hand the Worker plain text.
//
// Returns the extracted text for a spreadsheet, or undefined for any other file
// type (which the Worker handles directly: PDFs/images by signed URL, CSV/TXT by
// a light TextDecoder). `xlsx` is dynamically imported so it only loads when a
// spreadsheet is actually dropped.

const SHEET_EXTS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'])

export async function spreadsheetPretext(file: File): Promise<string | undefined> {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!SHEET_EXTS.has(ext)) return undefined
  try {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const parts: string[] = []
    for (const name of wb.SheetNames) {
      parts.push(`# Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
    }
    // The parser only reads the first ~24k chars; cap the payload we send.
    return parts.join('\n\n').slice(0, 100_000)
  } catch {
    // If client conversion fails, return undefined — the Worker will store the
    // file and flag it for manual reading rather than crashing.
    return undefined
  }
}
