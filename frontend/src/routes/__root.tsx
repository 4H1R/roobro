import { createRootRoute, Outlet } from "@tanstack/react-router"
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
  const language = ((i18n.resolvedLanguage ?? i18n.language) as Language) in languages
    ? ((i18n.resolvedLanguage ?? i18n.language) as Language)
    : "fa"

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = languages[language].dir
  }, [language])

  return (
    <ThemeProvider>
      <Outlet />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  )
}
