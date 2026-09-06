import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, LockKeyhole, Video } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { createMeeting, meetingStorageKey } from "@/lib/api"

export const Route = createFileRoute("/new")({ component: NewMeetingPage })

function NewMeetingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
    } catch {
      const demoCode = `demo-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(`roobro:demo:${demoCode}`, title.trim())
      sessionStorage.setItem(meetingStorageKey(demoCode), "demo-host")
      await navigate({ to: "/meet/$code", params: { code: demoCode } })
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="create-page">
      <header className="simple-header">
        <Link to="/" className="brand"><span className="brand-mark"><BrandMark /></span><span>{t("brand.name")}</span></Link>
        <Link to="/" className="back-link"><ArrowLeft />{t("create.back")}</Link>
      </header>
      <section className="create-card">
        <div className="create-icon"><Video /></div>
        <div className="eyebrow">{t("create.eyebrow")}</div>
        <h1>{t("create.title")}</h1>
        <p>{t("create.body")}</p>
        <form onSubmit={submit}>
          <label htmlFor="meeting-title">{t("create.label")}</label>
          <input id="meeting-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("create.placeholder")} />
          {error && <span className="form-error">{error}</span>}
          <button type="submit" disabled={pending || title.trim().length < 2}>
            <Video />{pending ? t("create.creating") : t("create.submit")}
          </button>
        </form>
        <div className="host-note"><LockKeyhole />{t("create.note")}</div>
      </section>
    </main>
  )
}
