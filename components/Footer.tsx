const links = ['Bookkeeping', 'Financial Reporting', 'Tax Preparation', 'Payroll']

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 shrink-0">
      <div className="max-w-6xl mx-auto px-6 h-11 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-xs font-semibold text-gray-900">Rovelo Inc.</span>
          <span className="hidden md:flex items-center gap-4">
            {links.map((l) => (
              <span key={l} className="text-xs text-gray-400">{l}</span>
            ))}
          </span>
        </div>
        <span className="text-xs text-gray-400">© {new Date().getFullYear()} · San Diego, CA</span>
      </div>
    </footer>
  )
}
