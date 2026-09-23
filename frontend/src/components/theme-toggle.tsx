import { Moon, Sun } from "lucide-react"
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const THEME_STORAGE_KEY = "roobro-theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readTheme(): Theme {
  if (typeof window === "undefined") return "light"

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#1c171f" : "#faf8f7")
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useLayoutEffect(() => applyTheme(theme), [theme])

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "light" ? "dark" : "light"
    applyTheme(nextTheme)

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // The selected theme still applies when storage is unavailable.
    }

    setTheme(nextTheme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function ThemeToggle() {
  const context = useContext(ThemeContext)
  const { t } = useTranslation()

  if (!context) throw new Error("ThemeToggle must be rendered inside ThemeProvider")

  const { theme, toggleTheme } = context
  const label = theme === "light" ? t("theme.toDark") : t("theme.toLight")

  return (
    <button
      className={`theme-toggle theme-toggle-${theme}`}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      <Sun aria-hidden="true" />
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <Moon aria-hidden="true" />
    </button>
  )
}
