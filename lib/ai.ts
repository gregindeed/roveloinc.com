import 'server-only'

// Cheap + fast by default. Override with ANTHROPIC_MODEL (e.g. a Sonnet id) any time.
const DEFAULT_MODEL = 'claude-haiku-4-5'

const SYSTEM = `You are "the Overseer" — a sharp, candid compliance and bookkeeping advisor for a California business-services firm (Rovelo Inc). You are given a JSON snapshot of one client entity's data and asked for a brief assessment for a given tab/scope.

Tell the bookkeeper, in first person, what looks good, what is behind or at risk, and — critically — what data is MISSING that you need to do your job. Be specific and cite the actual numbers, dates, and gaps from the snapshot. If key facts are absent (entity type, EIN, agency accounts, officers/ownership, etc.), explicitly ask for them and say why they matter. Flag compliance risks plainly (overdue filings, unpaid obligations, personal charges needing reclassification).

Rules:
- 2 to 4 short sentences. Plain language. No preamble, no headings, no bullet lists.
- Never invent data. If the snapshot lacks something, say you lack it and ask for it.
- Be constructive but honest — you are a critical helping hand, not a cheerleader.
- End with the single most important next action, if there is a clear one.`

export function overseerModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

export async function assess(scope: string, context: unknown): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Scope: ${scope}\n\nEntity data snapshot (JSON):\n${JSON.stringify(context, null, 2)}\n\nGive your assessment for this scope.`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = (data?.content ?? [])
    .filter((b: { type?: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n')
    .trim()
  return text || 'No assessment returned.'
}
