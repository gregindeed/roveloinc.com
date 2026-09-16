'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptSecret } from '@/lib/crypto'
import { sendEmail } from '@/lib/email'
import { applicationReceivedEmailHtml, applicationSubmittedEmailHtml } from '@/lib/propertyEmail'
import { SCREENING_QUESTIONS, type ApplicationDetails, type ScreeningAnswer } from '@/lib/property'

const usd = (n: number) => (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Base URL of the current deployment, from the request host.
function siteUrl(): string {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

// PUBLIC submit — the prospect is NOT logged in. Authorization is the
// unguessable token, so this uses the service-role client (bypasses RLS) and
// only ever touches the one application that matches the token. SSN is
// encrypted at rest, same as tenant profiles.
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k)
  if (v === '') return null
  const n = Number(v.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

// Drop null/empty entries so `details` stays compact.
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = v
  }
  return out as T
}

export async function submitApplication(token: string, formData: FormData) {
  const admin = createAdminClient()
  const { data: appRow } = await admin
    .from('rental_applications')
    .select('id, status, property_id, unit_id, client_id, invited_by, invite_email')
    .eq('token', token)
    .maybeSingle()
  if (!appRow) redirect('/apply/invalid')
  const app = appRow as {
    id: string
    status: string
    property_id: string
    unit_id: string | null
    client_id: string
    invited_by: string | null
    invite_email: string | null
  }
  // Already submitted / decided — don't allow a resubmit; show the done state.
  if (app.status !== 'invited') redirect(`/apply/${token}?done=1`)

  const fullName = str(formData, 'full_name')
  if (!fullName) redirect(`/apply/${token}?error=${encodeURIComponent('Your full legal name is required.')}`)
  if (str(formData, 'consent_bg') !== 'on') {
    redirect(`/apply/${token}?error=${encodeURIComponent('Please check the background-check consent to submit.')}`)
  }

  // Background screening answers: one yes/no + optional explanation per question.
  const screening: Record<string, ScreeningAnswer> = {}
  for (const q of SCREENING_QUESTIONS) {
    const ans = str(formData, `screen_${q.key}`)
    if (ans !== 'yes' && ans !== 'no') continue
    const yes = ans === 'yes'
    const explanation = str(formData, `screen_${q.key}_ex`) || null
    screening[q.key] = yes ? { yes, explanation } : { yes }
  }

  const details = compact<ApplicationDetails>({
    id_number: str(formData, 'id_number') || null,
    id_state: str(formData, 'id_state') || null,
    current_landlord: str(formData, 'current_landlord') || null,
    current_landlord_phone: str(formData, 'current_landlord_phone') || null,
    current_rent: num(formData, 'current_rent'),
    current_since: str(formData, 'current_since') || null,
    reason_leaving: str(formData, 'reason_leaving') || null,
    prior_address: str(formData, 'prior_address') || null,
    prior_landlord_phone: str(formData, 'prior_landlord_phone') || null,
    prior_rent: num(formData, 'prior_rent'),
    prior_dates: str(formData, 'prior_dates') || null,
    prior_reason_leaving: str(formData, 'prior_reason_leaving') || null,
    job_title: str(formData, 'job_title') || null,
    employer_phone: str(formData, 'employer_phone') || null,
    supervisor: str(formData, 'supervisor') || null,
    employed_since: str(formData, 'employed_since') || null,
    other_income_source: str(formData, 'other_income_source') || null,
    other_income_amount: num(formData, 'other_income_amount'),
    co_applicant: str(formData, 'co_applicant') || null,
    other_occupants: str(formData, 'other_occupants') || null,
    emergency_name: str(formData, 'emergency_name') || null,
    emergency_relationship: str(formData, 'emergency_relationship') || null,
    emergency_phone: str(formData, 'emergency_phone') || null,
    signature: str(formData, 'signature') || null,
    signed_date: new Date().toISOString().slice(0, 10),
  })
  if (Object.keys(screening).length > 0) details.screening = screening

  const patch: Record<string, unknown> = {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    full_name: fullName,
    email: str(formData, 'email') || null,
    phone: str(formData, 'phone') || null,
    dob: str(formData, 'dob') || null,
    current_address: str(formData, 'current_address') || null,
    employer: str(formData, 'employer') || null,
    monthly_income: num(formData, 'monthly_income'),
    desired_move_in: str(formData, 'desired_move_in') || null,
    occupants: num(formData, 'occupants'),
    pets: str(formData, 'pets') || null,
    vehicles: str(formData, 'vehicles') || null,
    prior_landlord: str(formData, 'prior_landlord') || null,
    references_text: str(formData, 'references_text') || null,
    consent_bg: true,
    notes: str(formData, 'notes') || null,
    details,
  }
  const ssnRaw = str(formData, 'ssn').replace(/\D/g, '')
  if (ssnRaw) {
    patch.ssn_enc = await encryptSecret(ssnRaw)
    patch.ssn_last4 = ssnRaw.slice(-4)
  }

  const { error: updErr } = await admin.from('rental_applications').update(patch).eq('id', app.id)
  if (updErr) {
    // Surface the failure instead of silently showing "submitted" — otherwise a
    // missing column/migration looks like a successful submit that never saved.
    redirect(`/apply/${token}?error=${encodeURIComponent(`We couldn't save your application: ${updErr.message}. Please try again or contact the property manager.`)}`)
  }

  // Notify both sides. Best-effort — a failed email must not fail the submit.
  const applicantEmail = str(formData, 'email') || app.invite_email
  try {
    const [{ data: property }, { data: unit }, { data: client }] = await Promise.all([
      admin.from('properties').select('name').eq('id', app.property_id).maybeSingle(),
      app.unit_id ? admin.from('units').select('label').eq('id', app.unit_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('clients').select('name').eq('id', app.client_id).maybeSingle(),
    ])
    const propertyName = (property?.name as string) ?? 'the property'
    const unitLabel = (unit?.label as string) ?? ''
    const landlordName = (client?.name as string) ?? propertyName

    // Confirmation to the applicant.
    if (applicantEmail) {
      await sendEmail({
        to: applicantEmail,
        subject: `Application received — ${propertyName}`,
        html: applicationReceivedEmailHtml({ applicantName: fullName, landlordName, propertyName, unitLabel }),
      })
    }

    // Heads-up to whoever invited them (the property manager).
    if (app.invited_by) {
      const { data: inviter } = await admin.auth.admin.getUserById(app.invited_by)
      const managerEmail = inviter?.user?.email ?? null
      if (managerEmail) {
        const income = num(formData, 'monthly_income')
        await sendEmail({
          to: managerEmail,
          subject: `New application — ${fullName} · ${propertyName}`,
          html: applicationSubmittedEmailHtml({
            applicantName: fullName,
            propertyName,
            unitLabel,
            email: applicantEmail,
            phone: str(formData, 'phone') || null,
            monthlyIncome: income != null ? usd(income) : null,
            url: `${siteUrl()}/admin/properties/${app.property_id}`,
          }),
        })
      }
    }
  } catch {
    /* emails are best-effort; the application is already saved */
  }

  redirect(`/apply/${token}?done=1`)
}
