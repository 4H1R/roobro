import { Link } from "@tanstack/react-router"
import { ArrowRight, Github } from "lucide-react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"

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
