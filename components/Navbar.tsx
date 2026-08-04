export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-gray-900">Rovelo</span>
          <span className="text-base font-normal text-gray-400" style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic' }}>Inc.</span>
          <span className="text-xs font-medium text-gray-500 tracking-wide hidden sm:inline">Business Advisory &amp; Solutions</span>
        </a>
        <a
          href="/login"
          className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Client Login
        </a>
      </div>
    </header>
  )
}
