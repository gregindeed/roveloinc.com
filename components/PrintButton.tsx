'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
    >
      Print / Save PDF
    </button>
  )
}
