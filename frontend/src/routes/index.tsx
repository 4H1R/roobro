import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowUpRight, Github, Keyboard, LockKeyhole, Mic, MonitorUp, Sparkles, Users, Video, VideoOff } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const [code, setCode] = useState("")

  const startMeeting = () => void navigate({ to: "/new" })
  const joinMeeting = () => {
    const room = code.trim().split("/").filter(Boolean).pop()
    if (room) void navigate({ to: "/meet/$code", params: { code: room } })
  }

  return (
    <motion.main className="site-shell" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.35 }}>
      <motion.div className="ambient-shape ambient-shape-one" animate={shouldReduceMotion ? undefined : { x: [0, 14, 0], y: [0, -10, 0] }} transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }} aria-hidden="true" />
      <motion.div className="ambient-shape ambient-shape-two" animate={shouldReduceMotion ? undefined : { x: [0, -12, 0], y: [0, 12, 0] }} transition={{ duration: 14, ease: "easeInOut", repeat: Infinity }} aria-hidden="true" />
      <motion.header className="topbar" initial={shouldReduceMotion ? false : { opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <a className="brand" href="#" aria-label={t("brand.name")}>
          <span className="brand-mark"><BrandMark /></span>
          <span>{t("brand.name")}</span>
        </a>
        <nav className="nav-links" aria-label={t("nav.label")}>
          <ThemeToggle />
          <a className="github-link" href="https://github.com/4H1R/roobro" target="_blank" rel="noreferrer" aria-label={t("nav.github")} title={t("nav.github")}>
            <Github aria-hidden="true" />
          </a>
        </nav>
      </motion.header>

      <section className="hero">
        <motion.div className="hero-copy" initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.52, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}>
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
        </motion.div>

        <motion.div className="product-preview" initial={shouldReduceMotion ? false : { opacity: 0, x: 24, y: 10, scale: 0.97 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.58, delay: shouldReduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }} aria-label={t("home.previewTitle")}>
          <div className="preview-glow" />
          <div className="preview-orbit preview-orbit-one" aria-hidden="true" />
          <div className="preview-orbit preview-orbit-two" aria-hidden="true" />
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
            <div className="control-dock">
              <button aria-label={t("home.muteMicrophone")}><Mic /></button>
              <button aria-label={t("home.turnOffCamera")}><VideoOff /></button>
              <button aria-label={t("home.shareScreen")}><MonitorUp /></button>
              <button className="end-call" aria-label={t("home.endCall")}><VideoOff /></button>
            </div>
          </div>
        </motion.div>
      </section>
    </motion.main>
  )
}
