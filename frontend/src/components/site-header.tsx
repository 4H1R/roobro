import { Link } from "@tanstack/react-router"
import { ArrowRight, createLucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"

// lucide-react 1.x dropped brand icons; this is the path data of its former Github icon.
const Github = createLucideIcon("github", [
  ["path", { d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4", key: "tonef" }],
  ["path", { d: "M9 18c-4.51 2-5-2-7-2", key: "9comsn" }],
])

export function SiteHeader({ back = false }: { back?: boolean }) {
  const { t } = useTranslation()
  return <header className="site-header">
    <Link to="/" className="brand" aria-label={t("brand.name")}>
      <BrandMark />
      <span>{t("brand.name")}</span>
    </Link>
    <nav className="nav-links" aria-label={t("nav.label")}>
      {back ? <Link to="/" className="back-link"><ArrowRight aria-hidden="true" />{t("create.back")}</Link> : <a className="source-link" aria-label={t("nav.github")} href="https://github.com/4H1R/roobro" target="_blank" rel="noreferrer"><Github aria-hidden="true" /><span>{t("nav.source")}</span></a>}
      <span className="nav-divider" aria-hidden="true" />
      <ThemeToggle />
    </nav>
  </header>
}

export function SiteFooter() {
  const { t } = useTranslation()
  return <footer className="site-footer"><span>{t("brand.tagline")}</span><span dir="ltr">roobro<span className="footer-dot">.</span>ir</span></footer>
}
