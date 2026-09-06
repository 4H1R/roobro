import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import fa from "./locales/fa.json"
import en from "./locales/en.json"

export const languages = {
  fa: { label: "فارسی", dir: "rtl" as const },
  en: { label: "English", dir: "ltr" as const }
}

export type Language = keyof typeof languages

const isBrowser = typeof window !== "undefined"
if (isBrowser) i18n.use(LanguageDetector)

i18n.use(initReactI18next).init({
  resources: { fa: { translation: fa }, en: { translation: en } },
  lng: isBrowser ? undefined : "fa",
  fallbackLng: "fa",
  supportedLngs: ["fa", "en"],
  interpolation: { escapeValue: false },
  detection: { order: ["localStorage"], caches: ["localStorage"] }
})

export default i18n
