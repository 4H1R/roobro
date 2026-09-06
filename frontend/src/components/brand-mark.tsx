interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  return <img src="/logo.svg" alt="" aria-hidden="true" className={className} />
}
