import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, LockKeyhole, Video } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { APIError, createMeeting, meetingStorageKey } from "@/lib/api"

export const Route = createFileRoute("/new")({ component: NewMeetingPage })

function NewMeetingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const [title, setTitle] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (title.trim().length < 2) return
    setPending(true)
    setError("")
    try {
      const result = await createMeeting(title.trim())
      sessionStorage.setItem(meetingStorageKey(result.meeting.code), result.host_token)
      await navigate({ to: "/meet/$code", params: { code: result.meeting.code } })
    } catch (error) {
      if (error instanceof APIError && [413, 429, 503].includes(error.status)) {
        setError(t("create.serviceBusy"))
        return
      }
      const demoCode = `demo-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(`roobro:demo:${demoCode}`, title.trim())
      sessionStorage.setItem(meetingStorageKey(demoCode), "demo-host")
      await navigate({ to: "/meet/$code", params: { code: demoCode } })
    } finally {
      setPending(false)
    }
  }

  return (
    <motion.main className="create-page" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}>
      <motion.header className="simple-header" initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}>
        <Link to="/" className="brand"><span className="brand-mark"><BrandMark /></span><span>{t("brand.name")}</span></Link>
        <Link to="/" className="back-link"><ArrowLeft />{t("create.back")}</Link>
      </motion.header>
      <motion.section className="create-card" initial={shouldReduceMotion ? false : { opacity: 0, y: 22, scale: 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}>
        <motion.div className="create-icon" initial={shouldReduceMotion ? false : { rotate: -8, scale: 0.82 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, delay: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}><Video /></motion.div>
        <div className="eyebrow">{t("create.eyebrow")}</div>
        <h1>{t("create.title")}</h1>
        <p>{t("create.body")}</p>
        <form onSubmit={submit}>
          <label htmlFor="meeting-title">{t("create.label")}</label>
          <input id="meeting-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("create.placeholder")} />
          <AnimatePresence>{error && <motion.span className="form-error" initial={shouldReduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>{error}</motion.span>}</AnimatePresence>
          <button type="submit" disabled={pending || title.trim().length < 2}>
            <Video />{pending ? t("create.creating") : t("create.submit")}
          </button>
        </form>
        <div className="host-note"><LockKeyhole />{t("create.note")}</div>
      </motion.section>
    </motion.main>
  )
}
