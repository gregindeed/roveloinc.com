import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const services = [
  { num: '01', title: 'Bookkeeping', desc: 'Monthly reconciliation and clean, reliable records.' },
  { num: '02', title: 'Financial Reporting', desc: 'P&L, balance sheets, and cash flow on your schedule.' },
  { num: '03', title: 'Tax Preparation', desc: 'Year-end filings and quarterly estimates, on time.' },
  { num: '04', title: 'Payroll', desc: 'Processing, filings, and compliance—handled.' },
]

export default function Home() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navbar />

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col mt-14 min-h-0">
        <div className="flex-1 max-w-6xl mx-auto w-full px-6 flex flex-col md:flex-row md:items-stretch py-8 min-h-0">

          {/* Left: brand */}
          <div className="flex-1 flex flex-col justify-center pr-0 md:pr-12 border-b md:border-b-0 md:border-r border-gray-100 pb-8 md:pb-0">
            <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 mb-4 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-gray-500 tracking-wide">Business Advisory &amp; Solutions</span>
            </div>
            <h1
              className="font-sans font-extrabold text-gray-900 leading-[0.9] tracking-tight"
              style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
            >
              ROVELO <span className="text-gray-300" style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic', fontWeight: 400 }}>Inc.</span>
            </h1>
            <p className="mt-4 text-xl font-medium text-gray-500 max-w-sm leading-snug">
              Delivering solutions — financial clarity and operational systems, built for business.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.079 3.514-4.829 3.514-8.07a6.802 6.802 0 10-13.604 0c0 3.241 1.57 5.991 3.514 8.07a19.575 19.575 0 002.682 2.282 16.975 16.975 0 001.144.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Proudly based in San Diego, CA
            </p>
          </div>

          {/* Right: services */}
          <div className="md:w-64 lg:w-72 flex flex-col justify-center md:pl-10 pt-8 md:pt-0">
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-gray-400 mb-4">
              What we do
            </p>
            {services.map((s, i) => (
              <div
                key={s.num}
                className={`flex gap-3 items-start py-3 ${i < services.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <span className="text-[10px] text-gray-300 font-medium pt-0.5 w-5 shrink-0">{s.num}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>

        <Footer />
      </section>
    </div>
  )
}
