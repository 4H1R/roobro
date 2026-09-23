import rooMark from "../../brand/roo.svg?raw"

interface BrandMarkProps {
  className?: string
}

// Read the trusted master vector rather than duplicating its geometry in the UI.
const markPath = rooMark.match(/<path[^>]*\sd="([^"]+)"/)?.[1]
if (!markPath) throw new Error("The Roo master SVG must contain a path")

export function BrandMark({ className = "" }: BrandMarkProps) {
  return <svg viewBox="0 0 128 128" fill="currentColor" className={`brand-mark ${className}`.trim()} aria-hidden="true"><path d={markPath} /></svg>
}
