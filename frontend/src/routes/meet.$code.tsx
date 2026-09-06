import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Check, Copy, Mic, MicOff, ShieldCheck, Video, VideoOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand-mark"
import { MeetingRoom } from "@/components/meeting-room"
import { endMeeting, getMeeting, joinMeeting, meetingStorageKey, type JoinResult, type Meeting } from "@/lib/api"

export const Route = createFileRoute("/meet/$code")({ component: MeetingPage })

function MeetingPage() {
  const { code } = Route.useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [state, setState] = useState<"loading" | "lobby" | "room" | "missing" | "ended">("loading")
  const [name, setName] = useState("")
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [copied, setCopied] = useState(false)

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
    await navigator.clipboard.writeText(location.href)
    setCopied(true)
    toast.success(t("lobby.copied"))
    window.setTimeout(() => setCopied(false), 1600)
  }

  const join = async () => {
    if (!meeting || name.trim().length < 2) return
    setJoining(true)
    const hostToken = sessionStorage.getItem(meetingStorageKey(code)) ?? undefined
    try {
      const result = code.startsWith("demo-")
        ? { meeting: { ...meeting, status: "active" as const }, token: "", server_url: "", role: hostToken ? "host" as const : "participant" as const, identity: `demo-${Date.now()}`, demo: true }
        : await joinMeeting(code, name.trim(), hostToken)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setJoinResult(result)
      setState("room")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("lobby.notFound"))
    } finally { setJoining(false) }
  }

  const leave = () => void navigate({ to: "/" })
  const end = async () => {
    const hostToken = sessionStorage.getItem(meetingStorageKey(code))
    if (hostToken && !code.startsWith("demo-")) await endMeeting(code, hostToken).catch(() => undefined)
    void navigate({ to: "/" })
  }

  if (state === "room" && joinResult) return <MeetingRoom result={joinResult} displayName={name} code={code} cameraOn={cameraOn} micOn={micOn} onLeave={leave} onEnd={end} />
  if (state === "loading") return <main className="status-page"><div className="loading-mark"><BrandMark /></div><p>{t("lobby.checking")}</p></main>
  if (state === "missing" || state === "ended") return <main className="status-page"><div className="status-icon"><VideoOff /></div><h1>{state === "ended" ? t("lobby.ended") : t("lobby.notFound")}</h1><Link to="/">{t("lobby.goHome")}</Link></main>

  return (
    <main className="lobby-page">
      <header className="lobby-header"><Link to="/" className="brand"><span className="brand-mark"><BrandMark /></span><span>{t("brand.name")}</span></Link><span>{t("lobby.brand")}</span></header>
      <section className="lobby-layout">
        <div className="camera-preview">
          {cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="camera-placeholder"><span>{name.trim().slice(0,1).toUpperCase() || "r"}</span></div>}
          <div className="preview-title"><strong>{meeting?.title}</strong><code dir="ltr">{code}</code></div>
          <div className="preview-toggles">
            <button className={!micOn ? "off" : ""} onClick={() => setMicOn(!micOn)} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
            <button className={!cameraOn ? "off" : ""} onClick={() => setCameraOn(!cameraOn)} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
          </div>
        </div>
        <div className="join-card">
          <div className="guest-chip"><ShieldCheck />{t("lobby.guest")}</div>
          <h1>{t("lobby.ready")}</h1>
          <p>{meeting?.title}</p>
          <label htmlFor="display-name">{t("lobby.name")}</label>
          <input id="display-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void join()} placeholder={t("lobby.namePlaceholder")} />
          {permissionDenied && <span className="permission-note">{t("lobby.permission")}</span>}
          <button className="join-now" disabled={joining || name.trim().length < 2} onClick={join}>{joining ? t("lobby.joining") : t("lobby.join")}</button>
          <button className="copy-link" onClick={copyLink}>{copied ? <Check /> : <Copy />}{t(copied ? "lobby.copied" : "lobby.copy")}</button>
          <div className="safe-note"><ShieldCheck />{t("lobby.safe")}</div>
        </div>
      </section>
    </main>
  )
}
