const services = [
  {
    title: 'Bookkeeping',
    description: 'Monthly reconciliation, transaction categorization, and clean books you can rely on.',
  },
  {
    title: 'Financial Reporting',
    description: 'P&L statements, balance sheets, and cash flow reports delivered on your schedule.',
  },
  {
    title: 'Tax Preparation',
    description: 'Year-end filings and quarterly estimates handled accurately and on time.',
  },
  {
    title: 'Payroll',
    description: 'Payroll processing, tax filings, and compliance so you never miss a deadline.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-32 pb-24">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-6">Financial Services</p>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 leading-none mb-6">
          ROVELO Inc.
        </h1>
        <p className="text-base md:text-lg text-gray-500 max-w-md leading-relaxed">
          Clear books. Accurate reports. Financial clarity for businesses that mean business.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <a
            href="#services"
            className="text-xs tracking-widest uppercase bg-gray-900 text-white font-semibold px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            Our Services
          </a>
          <a
            href="#contact"
            className="text-xs tracking-widest uppercase border border-gray-300 hover:border-gray-600 text-gray-500 hover:text-gray-900 px-6 py-3 transition-all"
          >
            Get in Touch
          </a>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-6" />

      {/* Services */}
      <section id="services" className="max-w-6xl mx-auto w-full px-6 py-24">
        <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-10">What we do</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200">
          {services.map((s) => (
            <div key={s.title} className="bg-white p-8 hover:bg-gray-50 transition-colors">
              <h3 className="text-sm font-semibold text-gray-900 tracking-wide mb-3">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-6" />

      {/* Contact */}
      <section id="contact" className="max-w-6xl mx-auto w-full px-6 py-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-gray-400 mb-4">Contact</p>
            <h2 className="text-3xl font-bold text-gray-900">Ready to get started?</h2>
            <p className="text-gray-500 mt-2 text-sm max-w-sm">
              Reach out and we'll get your books in order.
            </p>
          </div>
          <a
            href="mailto:info@roveloinc.com"
            className="inline-block text-xs tracking-widest uppercase bg-gray-900 text-white font-semibold px-8 py-4 hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            info@roveloinc.com
          </a>
        </div>
      </section>

    </main>
  )
}
