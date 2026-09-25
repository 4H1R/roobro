import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Toaster } from "sonner"

import { ThemeProvider } from "@/components/theme-toggle"
import { languages, type Language } from "@/i18n"

import "@/i18n"
import "@/styles.css"

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  const { i18n } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const language = ((i18n.resolvedLanguage ?? i18n.language) as Language) in languages
    ? ((i18n.resolvedLanguage ?? i18n.language) as Language)
    : "fa"

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = languages[language].dir
  }, [language])

  // Keep metadata correct when the app navigates without a full page load.
  useEffect(() => {
    const isHome = pathname === "/"
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) {
      robots = document.createElement("meta")
      robots.name = "robots"
      document.head.append(robots)
    }
    robots.content = isHome ? "index, follow" : "noindex"

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (isHome) {
      if (!canonical) {
        canonical = document.createElement("link")
        canonical.rel = "canonical"
        document.head.append(canonical)
      }
      canonical.href = "https://roobro.ir/"
    } else {
      canonical?.remove()
    }
  }, [pathname])

  return (
    <ThemeProvider>
      <Outlet />
      <Toaster
        position="top-center"
        richColors
        style={{ fontFamily: "var(--app-font)" }}
        toastOptions={{ style: { fontSize: "14px", lineHeight: 1.7 } }}
      />
    </ThemeProvider>
  )
}
