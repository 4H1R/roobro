import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Check, Copy, Mic, MicOff, ShieldCheck, Video, VideoOff } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand-mark"
import { MeetingRoom } from "@/components/meeting-room"
import { useCopyFeedback } from "@/hooks/use-copy-feedback"
import { endMeeting, getMeeting, joinMeeting, meetingStorageKey, removeMeetingParticipant, type JoinResult, type Meeting } from "@/lib/api"
import { prepareMeetingSounds } from "@/lib/meeting-sounds"

export const Route = createFileRoute("/meet/$code")({ component: MeetingPage })

const rememberedNameStorageKey = "roobro:remembered-name"

function MeetingPage() {
  const { code } = Route.useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [state, setState] = useState<"loading" | "lobby" | "room" | "missing" | "ended">("loading")
  const [name, setName] = useState("")
  const [rememberName, setRememberName] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const { copied, copy } = useCopyFeedback()

  useEffect(() => {
    const rememberedName = localStorage.getItem(rememberedNameStorageKey)?.trim()
    if (!rememberedName) return

    setName(rememberedName)
    setRememberName(true)
  }, [])

  useEffect(() => {
    const demoTitle = sessionStorage.getItem(`roobro:demo:${code}`)
    if (demoTitle) {
      setMeeting({ id: code, code, title: demoTitle, status: "created", created_at: new Date().toISOString() })
      setState("lobby")
      return
    }
    getMeeting(code).then((value) => { setMeeting(value); setState(value.status === "ended" ? "ended" : "lobby") }).catch(() => setState("missing"))
  }, [code])

  useEffect(() => {
    if (state !== "lobby" || !cameraOn) { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; return }
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false }).then((stream) => { streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream }).catch(() => { setPermissionDenied(true); setCameraOn(false) })
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null }
  }, [state, cameraOn])

  const copyLink = async () => {
    await copy(location.href)
    toast.success(t("lobby.copied"))
  }

  const join = async () => {
    const displayName = name.trim()
    if (!meeting || displayName.length < 2) return
    prepareMeetingSounds()
    setJoining(true)
    const hostToken = sessionStorage.getItem(meetingStorageKey(code)) ?? undefined
    try {
      const result = code.startsWith("demo-")
        ? { meeting: { ...meeting, status: "active" as const }, token: "", server_url: "", role: hostToken ? "host" as const : "participant" as const, identity: `demo-${Date.now()}`, demo: true }
        : await joinMeeting(code, displayName, hostToken)
      if (rememberName) localStorage.setItem(rememberedNameStorageKey, displayName)
      else localStorage.removeItem(rememberedNameStorageKey)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setJoinResult(result)
      setState("room")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("lobby.notFound"))
    } finally { setJoining(false) }
  }

  const leave = () => void navigate({ to: "/" })
  const finished = () => setState("ended")
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
      toast.error(error instanceof Error ? error.message : t("room.endFailed"))
    }
  }

  const moderateParticipant = async (identity: string, ban: boolean) => {
    const hostToken = sessionStorage.getItem(meetingStorageKey(code))
    if (!hostToken || code.startsWith("demo-")) return
    try {
      await removeMeetingParticipant(code, identity, ban, hostToken)
      toast.success(t(ban ? "room.participantBanned" : "room.participantRemoved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("room.moderationFailed"))
      throw error
    }
  }

  if (state === "room" && joinResult) return <MeetingRoom result={joinResult} displayName={name} code={code} justCreated={meeting?.status === "created" && joinResult.role === "host"} cameraOn={cameraOn} micOn={micOn} onLeave={leave} onEnd={end} onFinished={finished} onModerateParticipant={moderateParticipant} />
  if (state === "loading") return <motion.main className="status-page" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}><motion.div className="loading-mark" animate={shouldReduceMotion ? undefined : { y: [0, -6, 0], scale: [1, 1.03, 1] }} transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}><BrandMark /></motion.div><p>{t("lobby.checking")}</p></motion.main>
  if (state === "missing" || state === "ended") return <motion.main className="status-page" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}><motion.div className="status-icon" initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.36, delay: shouldReduceMotion ? 0 : 0.08 }}><VideoOff /></motion.div><h1>{state === "ended" ? t("lobby.ended") : t("lobby.notFound")}</h1>{state === "ended" && <p>{t("lobby.endedBody")}</p>}<Link to="/">{t("lobby.goHome")}</Link></motion.main>

  return (
    <motion.main className="lobby-page" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}>
      <motion.header className="lobby-header" initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}><Link to="/" className="brand"><span className="brand-mark"><BrandMark /></span><span>{t("brand.name")}</span></Link><span>{t("lobby.brand")}</span></motion.header>
      <section className="lobby-layout">
        <motion.div className="camera-preview" initial={shouldReduceMotion ? false : { opacity: 0, x: -18, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.48, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}>
          {cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="camera-placeholder"><span>{name.trim().slice(0,1).toUpperCase() || "r"}</span></div>}
          <div className="preview-title"><strong>{meeting?.title}</strong><code dir="ltr">{code}</code></div>
          <div className="preview-toggles">
            <button className={!micOn ? "off" : ""} onClick={() => setMicOn(!micOn)} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
            <button className={!cameraOn ? "off" : ""} onClick={() => setCameraOn(!cameraOn)} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
          </div>
        </motion.div>
        <motion.div className="join-card" initial={shouldReduceMotion ? false : { opacity: 0, x: 18, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.48, delay: shouldReduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}>
          <div className="guest-chip"><ShieldCheck />{t("lobby.guest")}</div>
          <h1>{t("lobby.ready")}</h1>
          <p>{meeting?.title}</p>
          <label htmlFor="display-name">{t("lobby.name")}</label>
          <input id="display-name" autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void join()} placeholder={t("lobby.namePlaceholder")} />
          <label className="remember-name">
            <input type="checkbox" checked={rememberName} onChange={(event) => setRememberName(event.target.checked)} />
            <span>{t("lobby.rememberName")}</span>
          </label>
          {permissionDenied && <span className="permission-note">{t("lobby.permission")}</span>}
          <button className="join-now" disabled={joining || name.trim().length < 2} onClick={join}>{joining ? t("lobby.joining") : t("lobby.join")}</button>
          <button className="copy-link" onClick={copyLink} aria-live="polite">{copied ? <Check /> : <Copy />}{t(copied ? "common.copied" : "lobby.copy")}</button>
          <div className="safe-note"><ShieldCheck />{t("lobby.safe")}</div>
        </motion.div>
      </section>
    </motion.main>
  )
}
