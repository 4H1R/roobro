import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowUpRight, CalendarPlus, Captions, ChevronRight, Globe2, Keyboard, LockKeyhole, Mic, MonitorUp, Sparkles, Users, Video, VideoOff } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { languages, type Language } from "@/i18n"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const current = ((i18n.resolvedLanguage ?? i18n.language) as Language) in languages
    ? ((i18n.resolvedLanguage ?? i18n.language) as Language)
    : "fa"
  const [code, setCode] = useState("")

  const switchLanguage = () => void i18n.changeLanguage(current === "en" ? "fa" : "en")
  const startMeeting = () => void navigate({ to: "/new" })
  const joinMeeting = () => {
    const room = code.trim().split("/").filter(Boolean).pop()
    if (room) void navigate({ to: "/meet/$code", params: { code: room } })
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label={t("brand.name")}>
          <span className="brand-mark"><BrandMark /></span>
          <span>{t("brand.name")}</span>
        </a>
        <nav className="nav-links" aria-label={t("nav.label")}>
          <a href="#how">{t("nav.how")}</a>
          <a href="#security">{t("nav.security")}</a>
          <button className="language-button" onClick={switchLanguage} type="button">
            <Globe2 aria-hidden="true" />
            <span>{t("nav.language")}</span>
          </button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles aria-hidden="true" />{t("home.eyebrow")}</div>
          <h1>{t("home.title")}</h1>
          <p className="hero-lead">{t("home.body")}</p>

          <div className="meeting-actions">
            <button className="primary-action" type="button" onClick={startMeeting}>
              <Video aria-hidden="true" />
              <span>{t("home.newMeeting")}</span>
              <ArrowUpRight className="action-arrow" aria-hidden="true" />
            </button>
            <div className="join-field">
              <Keyboard aria-hidden="true" />
              <input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinMeeting()} placeholder={t("home.meetingCode")} aria-label={t("home.meetingCode")} />
              <button type="button" disabled={!code.trim()} onClick={joinMeeting}>{t("home.join")}</button>
            </div>
          </div>

          <p className="trust-line"><LockKeyhole aria-hidden="true" />{t("home.privacy")}</p>
        </div>

        <div className="product-preview" aria-label={t("home.previewTitle")}>
          <div className="preview-glow" />
          <div className="preview-window">
            <div className="preview-header">
              <div>
                <p>{t("home.previewTitle")}</p>
                <span><i />{t("home.live")}</span>
              </div>
              <span className="people-pill"><Users />{t("home.people")}</span>
            </div>
            <div className="video-grid">
              <div className="participant participant-main">
                <div className="avatar avatar-a">{t("home.participants.sara").slice(0, 1)}</div>
                <span className="name-chip"><i />{t("home.participants.sara")}</span>
              </div>
              <div className="participant"><div className="avatar avatar-b">{t("home.participants.arman").slice(0, 1)}</div><span className="name-chip"><i />{t("home.participants.arman")}</span></div>
              <div className="participant"><div className="avatar avatar-c">{t("home.participants.niloufar").slice(0, 1)}</div><span className="name-chip muted"><Mic />{t("home.participants.niloufar")}</span></div>
            </div>
            <div className="caption-chip"><Captions />{t("home.caption")}</div>
            <div className="control-dock">
              <button aria-label={t("home.muteMicrophone")}><Mic /></button>
              <button aria-label={t("home.turnOffCamera")}><VideoOff /></button>
              <button aria-label={t("home.shareScreen")}><MonitorUp /></button>
              <button className="end-call" aria-label={t("home.endCall")}><VideoOff /></button>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="feature-strip">
        <div><span><CalendarPlus /></span><strong>{t("home.featureOne")}</strong><ChevronRight /></div>
        <div><span><Globe2 /></span><strong>{t("home.featureTwo")}</strong><ChevronRight /></div>
      </section>
    </main>
  )
}
