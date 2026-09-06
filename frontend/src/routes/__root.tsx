import type { ReactNode } from "react"

import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Toaster } from "sonner"

import { languages, type Language } from "@/i18n"

import "@/i18n"
import "@/styles.css"

const SITE_URL = "https://roobro.ir"
const TITLE = "roobro — تماس تصویری روان و طبیعی"
const DESCRIPTION = "تجربه‌ای ساده و متمرکز برای جلسه‌های تصویری فارسی و انگلیسی."

export const Route = createRootRoute({
  // The app language is a device-local preference detected from localStorage
  // and the browser. Rendering route content on the server would always use
  // Persian, then mismatch when an English-preferring client hydrates. Keep the document
  // shell and metadata server-rendered, and render locale-aware UI on the client.
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#f7f8f4" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:locale", content: "fa_IR" },
      { property: "og:locale:alternate", content: "en_US" },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og.png` }
    ],
    links: [
      { rel: "canonical", href: SITE_URL },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" }
    ]
  }),
  component: RootComponent,
  shellComponent: RootDocument
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

  return <Outlet />
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body>
        {children}
        <Toaster position="top-center" richColors />
        <Scripts />
      </body>
    </html>
  )
}
