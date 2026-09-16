import { createAdminClient } from '@/lib/supabase/admin'
import { SCREENING_QUESTIONS } from '@/lib/property'
import { submitApplication } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Rental application — Rovelo Inc',
  robots: { index: false, follow: false },
}

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <span className="text-xl text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}>
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">{children}</div>
        <p className="text-center text-[11px] text-gray-400 mt-6">Rovelo Inc · San Diego, CA</p>
      </div>
    </div>
  )
}

// A titled group of fields inside the application form.
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="col-span-2 mt-2 border-t border-gray-100 pt-5 first:mt-0 first:border-0 first:pt-0">
      <legend className="mb-3 text-sm font-semibold text-gray-900">{title}</legend>
      {hint && <p className="-mt-2 mb-3 text-[11px] text-gray-400">{hint}</p>}
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  )
}

// One yes/no screening question with an optional explanation box.
function ScreeningQuestion({ qKey, prompt }: { qKey: string; prompt: string }) {
  return (
    <div className="col-span-2 rounded-lg border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-700">{prompt}</p>
        <div className="flex shrink-0 gap-3 pt-0.5">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="radio" name={`screen_${qKey}`} value="yes" className="border-gray-300" /> Yes
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="radio" name={`screen_${qKey}`} value="no" defaultChecked className="border-gray-300" /> No
          </label>
        </div>
      </div>
      <input
        name={`screen_${qKey}_ex`}
        placeholder="If yes, please explain (optional)"
        className={`${input} mt-2 text-xs`}
      />
    </div>
  )
}

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: { done?: string; error?: string }
}) {
  const admin = createAdminClient()
  const { data: appRow } = await admin
    .from('rental_applications')
    .select('id, status, property_id, unit_id, client_id')
    .eq('token', params.token)
    .maybeSingle()

  if (!appRow) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-gray-600">The application link is invalid or has expired. Please ask your property manager to send a new one.</p>
      </Shell>
    )
  }
  const app = appRow as { id: string; status: string; property_id: string; unit_id: string | null; client_id: string }

  // Context for the applicant (safe to show): what they're applying for.
  const [{ data: property }, { data: unit }, { data: client }] = await Promise.all([
    admin.from('properties').select('name, address').eq('id', app.property_id).maybeSingle(),
    app.unit_id ? admin.from('units').select('label').eq('id', app.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('clients').select('name').eq('id', app.client_id).maybeSingle(),
  ])
  const propertyName = (property?.name as string) ?? 'the property'
  const unitLabel = (unit?.label as string) ?? ''
  const landlord = (client?.name as string) ?? 'the property manager'
  const where = `${propertyName}${unitLabel ? ` · ${unitLabel}` : ''}`

  if (searchParams.done || app.status !== 'invited') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900">Application submitted</h1>
        <p className="mt-2 text-sm text-gray-600">
          Thank you — your application for <strong>{where}</strong> has been sent to {landlord}. They&apos;ll be in touch. You can close this page.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
        Rental application
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        For <strong>{where}</strong>
        {property?.address ? ` — ${property.address}` : ''}. Managed by {landlord}.
      </p>

      {searchParams.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
      )}

      <form action={submitApplication.bind(null, params.token)} className="mt-6 grid grid-cols-2 gap-3">
        {/* Personal & identification */}
        <Section title="Applicant">
          <div className="col-span-2">
            <label className={label} htmlFor="full_name">Full legal name *</label>
            <input id="full_name" name="full_name" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="dob">Date of birth</label>
            <input id="dob" name="dob" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="desired_move_in">Desired move-in</label>
            <input id="desired_move_in" name="desired_move_in" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="id_number">Driver&apos;s license / ID #</label>
            <input id="id_number" name="id_number" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="id_state">Issuing state</label>
            <input id="id_state" name="id_state" placeholder="e.g. CA" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="ssn">SSN (for background &amp; credit check)</label>
            <input id="ssn" name="ssn" inputMode="numeric" placeholder="optional · encrypted" className={input} />
          </div>
        </Section>

        {/* Current residence */}
        <Section title="Current residence">
          <div className="col-span-2">
            <label className={label} htmlFor="current_address">Current address</label>
            <input id="current_address" name="current_address" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="current_landlord">Landlord name</label>
            <input id="current_landlord" name="current_landlord" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="current_landlord_phone">Landlord phone</label>
            <input id="current_landlord_phone" name="current_landlord_phone" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="current_rent">Monthly rent</label>
            <input id="current_rent" name="current_rent" inputMode="decimal" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="current_since">Living there since</label>
            <input id="current_since" name="current_since" placeholder="e.g. Jan 2022" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="reason_leaving">Reason for leaving</label>
            <input id="reason_leaving" name="reason_leaving" className={input} />
          </div>
        </Section>

        {/* Prior residence */}
        <Section title="Prior residence" hint="Your previous home, if you've lived at your current address less than two years.">
          <div className="col-span-2">
            <label className={label} htmlFor="prior_address">Prior address</label>
            <input id="prior_address" name="prior_address" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="prior_landlord">Landlord name</label>
            <input id="prior_landlord" name="prior_landlord" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="prior_landlord_phone">Landlord phone</label>
            <input id="prior_landlord_phone" name="prior_landlord_phone" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="prior_rent">Monthly rent</label>
            <input id="prior_rent" name="prior_rent" inputMode="decimal" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="prior_dates">Dates lived there</label>
            <input id="prior_dates" name="prior_dates" placeholder="e.g. 2019–2022" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="prior_reason_leaving">Reason for leaving</label>
            <input id="prior_reason_leaving" name="prior_reason_leaving" className={input} />
          </div>
        </Section>

        {/* Employment & income */}
        <Section title="Employment & income">
          <div>
            <label className={label} htmlFor="employer">Employer</label>
            <input id="employer" name="employer" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="job_title">Job title</label>
            <input id="job_title" name="job_title" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="employer_phone">Employer phone</label>
            <input id="employer_phone" name="employer_phone" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="supervisor">Supervisor</label>
            <input id="supervisor" name="supervisor" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="employed_since">Employed since</label>
            <input id="employed_since" name="employed_since" placeholder="e.g. Mar 2021" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="monthly_income">Gross monthly income</label>
            <input id="monthly_income" name="monthly_income" inputMode="decimal" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="other_income_source">Other income (source)</label>
            <input id="other_income_source" name="other_income_source" placeholder="e.g. child support" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="other_income_amount">Other income (monthly)</label>
            <input id="other_income_amount" name="other_income_amount" inputMode="decimal" className={input} />
          </div>
        </Section>

        {/* Household */}
        <Section title="Household">
          <div>
            <label className={label} htmlFor="occupants">Total occupants</label>
            <input id="occupants" name="occupants" inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="pets">Pets</label>
            <input id="pets" name="pets" placeholder="e.g. 1 cat, 25lb dog" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="co_applicant">Co-applicant (name &amp; email)</label>
            <input id="co_applicant" name="co_applicant" placeholder="Anyone 18+ who will also be on the lease" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="other_occupants">Other occupants (names &amp; ages)</label>
            <input id="other_occupants" name="other_occupants" placeholder="e.g. Sam 9, Alex 6" className={input} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="vehicles">Vehicles</label>
            <input id="vehicles" name="vehicles" placeholder="Make / model / plate" className={input} />
          </div>
        </Section>

        {/* Emergency contact */}
        <Section title="Emergency contact">
          <div className="col-span-2">
            <label className={label} htmlFor="emergency_name">Name</label>
            <input id="emergency_name" name="emergency_name" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="emergency_relationship">Relationship</label>
            <input id="emergency_relationship" name="emergency_relationship" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="emergency_phone">Phone</label>
            <input id="emergency_phone" name="emergency_phone" className={input} />
          </div>
        </Section>

        {/* References */}
        <Section title="References">
          <div className="col-span-2">
            <label className={label} htmlFor="references_text">Personal / professional references</label>
            <textarea id="references_text" name="references_text" rows={2} placeholder="Name, relationship, phone" className={input} />
          </div>
        </Section>

        {/* Background questions */}
        <Section title="Background" hint="Please answer honestly — a yes doesn't automatically disqualify you.">
          {SCREENING_QUESTIONS.map((q) => (
            <ScreeningQuestion key={q.key} qKey={q.key} prompt={q.prompt} />
          ))}
        </Section>

        {/* Additional notes */}
        <Section title="Anything else">
          <div className="col-span-2">
            <textarea id="notes" name="notes" rows={2} placeholder="Anything you'd like the property manager to know" className={input} />
          </div>
        </Section>

        {/* Certify & sign */}
        <Section title="Certify & sign">
          <label className="col-span-2 flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" name="consent_bg" required className="mt-0.5 rounded border-gray-300" />
            <span>I authorize {landlord} to verify this information and run a background and credit check as part of this application.</span>
          </label>
          <div className="col-span-2">
            <label className={label} htmlFor="signature">Type your full name to sign *</label>
            <input id="signature" name="signature" required placeholder="Your full legal name" className={input} />
            <p className="mt-1 text-[11px] text-gray-400">
              By typing my name I certify that the information in this application is true and complete.
            </p>
          </div>
        </Section>

        <div className="col-span-2 pt-1">
          <button type="submit" className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
            Submit application
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">Your information is encrypted and shared only with {landlord}.</p>
        </div>
      </form>
    </Shell>
  )
}
