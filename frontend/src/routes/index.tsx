import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ArrowUpLeft, Keyboard, MonitorUp, Music2, Video } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ConversationArt } from "@/components/conversation-art"
import { SiteFooter, SiteHeader } from "@/components/site-header"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const joinMeeting = (event: React.FormEvent) => {
    event.preventDefault()
    const room = code.trim().split("/").filter(Boolean).pop()
    if (room) void navigate({ to: "/meet/$code", params: { code: room } })
  }

  return <main className="site-shell">
    <SiteHeader />
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="status-dot" />{t("home.eyebrow")}</div>
        <h1>{t("home.titleLineOne")}<br /><span>{t("home.titleLineTwo")}</span></h1>
        <p className="hero-lead">{t("home.body")}</p>
        <div className="meeting-actions">
          <button className="primary-action" type="button" onClick={() => void navigate({ to: "/new" })}><Video aria-hidden="true" /><span>{t("home.newMeeting")}</span><ArrowUpLeft className="action-arrow" aria-hidden="true" /></button>
          <span className="action-note">{t("home.noAccount")}</span>
        </div>
        <form className="join-meeting-form" onSubmit={joinMeeting}>
          <label htmlFor="meeting-code">{t("home.haveInvite")}</label>
          <div className="join-field"><Keyboard aria-hidden="true" /><input id="meeting-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("home.meetingCode")} autoComplete="off" spellCheck={false} /><button type="submit" disabled={!code.trim()}><span>{t("home.join")}</span><ArrowLeft aria-hidden="true" /></button></div>
        </form>
      </div>
      <ConversationArt />
    </section>
    <section className="home-features" aria-label={t("home.featuresLabel")}>
      {[{ icon: Video, key: "talk", number: "۰۱" }, { icon: MonitorUp, key: "share", number: "۰۲" }, { icon: Music2, key: "watch", number: "۰۳" }].map(({ icon: Icon, key, number }) => <article className="home-feature" key={key}><div className="feature-heading"><Icon aria-hidden="true" /><span>{number}</span></div><h2>{t(`home.features.${key}.title`)}</h2><p>{t(`home.features.${key}.body`)}</p></article>)}
    </section>
    <SiteFooter />
  </main>
}
