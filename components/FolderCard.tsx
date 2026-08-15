import Link from 'next/link'

// Bright, glossy Finder-style folder: borderless, soft drop shadow, sky-blue.
export default function FolderCard({
  href,
  label,
  count,
  sublabel,
  muted = false,
}: {
  href: string
  label: string
  count?: number
  sublabel?: string
  muted?: boolean
}) {
  const back = muted ? 'url(#fld-back-gray)' : 'url(#fld-back-blue)'
  const front = muted ? 'url(#fld-front-gray)' : 'url(#fld-front-blue)'

  return (
    <Link
      href={href}
      className="group flex flex-col items-center px-3 py-3 text-center"
    >
      <svg
        viewBox="0 0 56 48"
        className="h-24 w-24 transition-transform duration-200 ease-out group-hover:-translate-y-1"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="fld-back-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4CBAF2" />
            <stop offset="1" stopColor="#279FE8" />
          </linearGradient>
          <linearGradient id="fld-front-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#89D9FB" />
            <stop offset="1" stopColor="#45B4F1" />
          </linearGradient>
          <linearGradient id="fld-back-gray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C7CDD6" />
            <stop offset="1" stopColor="#AAB2BD" />
          </linearGradient>
          <linearGradient id="fld-front-gray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E2E6EC" />
            <stop offset="1" stopColor="#C8CFD8" />
          </linearGradient>
          <filter id="fld-shadow" x="-25%" y="-15%" width="150%" height="145%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#1f7fc0" floodOpacity="0.28" />
          </filter>
        </defs>
        <g filter="url(#fld-shadow)">
          {/* back sheet + tab (peeks above the front) */}
          <path
            fill={back}
            d="M6 13a4 4 0 0 1 4-4h11.2a3 3 0 0 1 2.2 1l2.9 3.1a3 3 0 0 0 2.2 1H46a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
          />
          {/* front pocket */}
          <path
            fill={front}
            d="M6 21a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
          />
          {/* glossy top-lip highlight */}
          <path fill="#ffffff" fillOpacity="0.30" d="M10 17h36a4 4 0 0 1 3.2 1.6H6.8A4 4 0 0 1 10 17z" />
        </g>
      </svg>
      <span className="mt-1 text-sm font-medium text-gray-800 leading-tight">{label}</span>
      {sublabel ? (
        <span className="text-[11px] text-gray-400">{sublabel}</span>
      ) : (
        <span className="text-[11px] text-gray-400">
          {count ?? 0} {count === 1 ? 'file' : 'files'}
        </span>
      )}
    </Link>
  )
}
