import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Check, Copy, Mic, MicOff, ShieldCheck, Video, VideoOff } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand-mark"
import { SiteFooter, SiteHeader } from "@/components/site-header"
import { MediaPermissionIntro } from "@/components/media-permission-intro"
import { MeetingRoom } from "@/components/meeting-room"
import { useCopyFeedback } from "@/hooks/use-copy-feedback"
import { useLobbyMedia } from "@/hooks/use-lobby-media"
import { APIError, endMeeting, getMeeting, joinMeeting, meetingStorageKey, removeMeetingParticipant, type JoinResult, type Meeting } from "@/lib/api"
import { prepareMeetingSounds } from "@/lib/meeting-sounds"

export const Route = createFileRoute("/meet/$code")({ component: MeetingPage })

const rememberedNameStorageKey = "roobro:remembered-name"

function meetingErrorState(error: unknown): "ended" | "missing" | null {
  if (!(error instanceof APIError)) return null
  switch (error.code ?? error.status) {
    case "meeting_ended":
    case 410:
      return "ended"
    case "meeting_not_found":
    case 404:
      return "missing"
    default:
      return null
  }
}

type MeetingSessionState =
  | { status: "loading" | "missing" | "ended" }
  | { status: "lobby"; meeting: Meeting }
  | { status: "room"; meeting: Meeting; result: JoinResult; displayName: string }

function MeetingPage() {
  const { code } = Route.useParams()
  return <MeetingSession key={code} code={code} />
}

function MeetingSession({ code }: { code: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const [session, setSession] = useState<MeetingSessionState>({ status: "loading" })
  const sessionActive = useRef(false)
  const state = session.status
  const meeting = "meeting" in session ? session.meeting : null
  const [name, setName] = useState("")
  const [rememberName, setRememberName] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const { access, requestAccess, cameraOn, setCameraOn, videoRef, previewUnavailable } = useLobbyMedia(state === "lobby")
  const [joining, setJoining] = useState(false)
  const { copied, copy } = useCopyFeedback()
  const errorMessage = (error: unknown, fallback: string) => {
    switch (meetingErrorState(error)) {
      case "ended": return t("lobby.ended")
      case "missing": return t("lobby.notFound")
      default: return t(fallback)
    }
  }

  useEffect(() => {
    sessionActive.current = true
    return () => { sessionActive.current = false }
  }, [])

  useEffect(() => {
    const rememberedName = localStorage.getItem(rememberedNameStorageKey)?.trim()
    if (!rememberedName) return

    setName(rememberedName)
    setRememberName(true)
  }, [])

  useEffect(() => {
    const demoTitle = sessionStorage.getItem(`roobro:demo:${code}`)
    if (demoTitle) {
      setSession({ status: "lobby", meeting: { id: code, code, title: demoTitle, status: "created", created_at: new Date().toISOString() } })
      return
    }
    let cancelled = false
    getMeeting(code).then((value) => {
      if (cancelled) return
      setSession(value.status === "ended" ? { status: "ended" } : { status: "lobby", meeting: value })
    }).catch((error) => {
      if (!cancelled) setSession({ status: meetingErrorState(error) === "ended" ? "ended" : "missing" })
    })
    return () => { cancelled = true }
  }, [code])

  const copyLink = async () => {
    await copy(location.href)
    toast.success(t("lobby.copied"))
  }

  const join = async () => {
    const displayName = name.trim()
    if (session.status !== "lobby" || displayName.length < 2 || access.status !== "granted" || joining) return
    const meeting = session.meeting
    prepareMeetingSounds()
    setJoining(true)
    const hostToken = sessionStorage.getItem(meetingStorageKey(code)) ?? undefined
    try {
      const result = code.startsWith("demo-")
        ? { meeting: { ...meeting, status: "active" as const }, token: "", server_url: "", role: hostToken ? "host" as const : "participant" as const, identity: `demo-${Date.now()}`, demo: true }
        : await joinMeeting(code, displayName, hostToken)
      if (!sessionActive.current) return
      if (rememberName) localStorage.setItem(rememberedNameStorageKey, displayName)
      else localStorage.removeItem(rememberedNameStorageKey)
      setSession({ status: "room", meeting, result, displayName })
    } catch (error) {
      if (sessionActive.current) toast.error(errorMessage(error, "lobby.joinFailed"))
    } finally {
      if (sessionActive.current) setJoining(false)
    }
  }

  const leave = () => void navigate({ to: "/" })
  const finished = () => setSession({ status: "ended" })
  const end = async () => {
    const hostToken = sessionStorage.getItem(meetingStorageKey(code))
    if (code.startsWith("demo-")) {
      finished()
      return
    }
    if (!hostToken) return
    try {
      await endMeeting(code, hostToken)
      finished()
    } catch (error) {
      toast.error(errorMessage(error, "room.endFailed"))
    }
  }

  const moderateParticipant = async (identity: string, ban: boolean) => {
    const hostToken = sessionStorage.getItem(meetingStorageKey(code))
    if (!hostToken || code.startsWith("demo-")) return
    try {
      await removeMeetingParticipant(code, identity, ban, hostToken)
      toast.success(t(ban ? "room.participantBanned" : "room.participantRemoved"))
    } catch (error) {
      toast.error(errorMessage(error, "room.moderationFailed"))
      throw error
    }
  }

  if (session.status === "room") return <MeetingRoom result={session.result} displayName={session.displayName} code={code} justCreated={session.meeting.status === "created" && session.result.role === "host"} cameraOn={cameraOn} micOn={micOn} onLeave={leave} onEnd={end} onFinished={finished} onModerateParticipant={moderateParticipant} />
  if (state === "loading") return <motion.main className="status-page" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}><motion.div className="loading-mark" animate={shouldReduceMotion ? undefined : { y: [0, -6, 0], scale: [1, 1.03, 1] }} transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}><BrandMark /></motion.div><p>{t("lobby.checking")}</p></motion.main>
  if (state === "missing" || state === "ended") return <motion.main className="status-page" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}><motion.div className="status-icon" initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.36, delay: shouldReduceMotion ? 0 : 0.08 }}><VideoOff /></motion.div><h1>{state === "ended" ? t("lobby.ended") : t("lobby.notFound")}</h1><p>{t(state === "ended" ? "lobby.endedBody" : "lobby.notFoundBody")}</p><Link to="/">{t("lobby.goHome")}</Link></motion.main>

  return (
    <motion.main className="lobby-page" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}>
      <SiteHeader back />
      <div className="lobby-heading"><span className="eyebrow">{t("lobby.step")}</span><h2>{meeting?.title}</h2></div>
      <section className="lobby-layout">
        <div className="preview-column">
        <motion.div className="camera-preview" initial={shouldReduceMotion ? false : { opacity: 0, x: -18, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.48, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}>
          {access.status === "granted" && cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="camera-placeholder"><span>{access.status === "granted" ? name.trim().slice(0,1).toUpperCase() || "r" : <Video />}</span></div>}
          <div className="preview-title"><span className="status-dot" /><strong>{t("lobby.preview")}</strong></div>
          {access.status === "granted" && <div className="preview-toggles">
            <button aria-label={micOn ? t("lobby.micOn") : t("lobby.micOff")} aria-pressed={micOn} className={!micOn ? "off" : ""} onClick={() => setMicOn(!micOn)} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
            <button aria-label={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")} aria-pressed={cameraOn} className={!cameraOn ? "off" : ""} onClick={() => setCameraOn(!cameraOn)} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
          </div>}
        </motion.div>
        <p className="preview-caption"><span>{t("lobby.preview")}</span>{t("lobby.previewNote")}</p>
        </div>
        <motion.div className="join-card" initial={shouldReduceMotion ? false : { opacity: 0, x: 18, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.48, delay: shouldReduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}>
          <div className="guest-chip"><ShieldCheck />{t(sessionStorage.getItem(meetingStorageKey(code)) ? "room.host" : "lobby.guest")}</div>
          {access.status !== "granted" ? <MediaPermissionIntro access={access} onAllow={requestAccess} /> : <>
            <h1>{t("lobby.ready")}</h1>
            <p>{meeting?.title}</p>
            <label htmlFor="display-name">{t("lobby.name")}</label>
            <input id="display-name" autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void join()} placeholder={t("lobby.namePlaceholder")} />
            <label className="remember-name">
              <input type="checkbox" checked={rememberName} onChange={(event) => setRememberName(event.target.checked)} />
              <span>{t("lobby.rememberName")}</span>
            </label>
            {previewUnavailable && <span className="permission-note">{t("lobby.permission")}</span>}
            <button className="join-now" disabled={joining || name.trim().length < 2} onClick={join}>{joining ? t("lobby.joining") : t("lobby.join")}</button>
          </>}
          <button className="copy-link" onClick={copyLink} aria-live="polite">{copied ? <Check /> : <Copy />}{t(copied ? "common.copied" : "lobby.copy")}</button>
          {access.status === "granted" && <div className="safe-note"><ShieldCheck />{t("lobby.safe")}</div>}
        </motion.div>
      </section>
      <SiteFooter />
    </motion.main>
  )
}
