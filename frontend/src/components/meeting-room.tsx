import { AudioTrack, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useLocalParticipant, useTracks } from "@livekit/components-react"
import { DisconnectReason, Track } from "livekit-client"
import { Check, Clock3, Hand, Info, MessageCircle, Mic, MicOff, MonitorUp, MoreHorizontal, PhoneOff, Send, Users, Video, VideoOff, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import "@livekit/components-styles"

import { BrandMark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCopyFeedback } from "@/hooks/use-copy-feedback"
import type { JoinResult } from "@/lib/api"
import { formatElapsedTime } from "@/lib/format-elapsed-time"
import { formatMessageTime } from "@/lib/format-message-time"

interface MeetingRoomProps {
  result: JoinResult
  displayName: string
  code: string
  cameraOn: boolean
  micOn: boolean
  onLeave: () => void
  onEnd: () => void
  onFinished: () => void
}

export function MeetingRoom(props: MeetingRoomProps) {
  if (props.result.demo || !props.result.token || !props.result.server_url) return <DemoRoom {...props} />
  return (
    <LiveKitRoom
      serverUrl={props.result.server_url}
      token={props.result.token}
      audio={props.micOn}
      video={props.cameraOn}
      className="meeting-room lk-room"
      data-lk-theme="default"
      onDisconnected={(reason) => reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED ? props.onFinished() : props.onLeave()}
    >
      <LiveRoomShell {...props} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function LiveRoomShell(props: MeetingRoomProps) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false })
  const shouldReduceMotion = useReducedMotion()
  return <RoomChrome {...props} stage={<div className="live-video-grid"><AnimatePresence initial={false}>{tracks.map((track) => <motion.div className="live-participant" layout key={`${track.participant.identity}-${track.source}`} initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: shouldReduceMotion ? 0 : 0.28 }}><ParticipantTile trackRef={track} /></motion.div>)}</AnimatePresence></div>} live />
}

function DemoRoom(props: MeetingRoomProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const stage = (
    <div className="demo-video-grid">
      <div className="demo-self"><span>{props.displayName.slice(0, 1).toUpperCase()}</span><em>{t("room.you")}</em></div>
      <div className="demo-waiting"><motion.div className="waiting-orbit" animate={shouldReduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 12, ease: "linear", repeat: Infinity }}><Users /></motion.div><strong>{t("room.waiting")}</strong><code dir="ltr">{props.code}</code></div>
    </div>
  )
  return <RoomChrome {...props} stage={stage} live={false} />
}

function RoomChrome({ result, displayName, code, cameraOn: initialCamera, micOn: initialMic, onLeave, onEnd, stage, live }: MeetingRoomProps & { stage: React.ReactNode; live: boolean }) {
  const { t, i18n } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [cameraOn, setCameraOn] = useState(initialCamera)
  const [micOn, setMicOn] = useState(initialMic)
  const [panel, setPanel] = useState<"people" | "chat" | "details" | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [messages, setMessages] = useState<Array<{ name: string; text: string; sentAt: number }>>([])
  const [message, setMessage] = useState("")
  const joinedAt = useRef(Date.now())
  const [now, setNow] = useState(joinedAt.current)
  const { copied, copy } = useCopyFeedback()
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const enterTransition = { duration: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] as const }
  const panelTransition = { duration: shouldReduceMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] as const }
  const panelOffset = i18n.dir() === "rtl" ? -36 : 36
  const parsedMeetingStart = result.meeting.started_at ? Date.parse(result.meeting.started_at) : Number.NaN
  const meetingStartedAt = Number.isNaN(parsedMeetingStart) ? joinedAt.current : parsedMeetingStart
  const meetingDuration = formatElapsedTime(now - meetingStartedAt, i18n.language)
  const participantDuration = formatElapsedTime(now - joinedAt.current, i18n.language)

  const togglePanel = (nextPanel: NonNullable<typeof panel>) => {
    if (panel === nextPanel) {
      setPanel(null)
      return
    }
    setPanel(nextPanel)
  }

  const openPanelFromMobileMenu = (nextPanel: NonNullable<typeof panel>) => {
    setMobileMenuOpen(false)
    togglePanel(nextPanel)
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) setMobileMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePress)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [mobileMenuOpen])

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    setMessages((current) => [...current, { name: displayName, text: message.trim(), sentAt: Date.now() }])
    setMessage("")
  }

  return (
    <motion.div className="room-chrome" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.32 }}>
      <motion.header className="room-header" initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={enterTransition}>
        <div><span className="room-brand"><BrandMark className="room-brand-mark" />{t("brand.name")}</span><i /> <strong>{result.meeting.title}</strong></div>
        <div className="room-header-actions">
          <div className="room-durations" role="timer" aria-label={t("room.durationSummary", { meeting: meetingDuration, participant: participantDuration })}>
            <Clock3 aria-hidden="true" />
            <div className="duration-stat"><span>{t("room.meetingDuration")}</span><time dir="ltr">{meetingDuration}</time></div>
            <i aria-hidden="true" />
            <div className="duration-stat"><span>{t("room.yourDuration")}</span><time dir="ltr">{participantDuration}</time></div>
          </div>
          <div className="connection-state"><motion.span animate={shouldReduceMotion ? undefined : { scale: [1, 1.28, 1], opacity: [1, 0.72, 1] }} transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }} />{live ? t("room.connected") : t("room.demo")}</div>
          <ThemeToggle />
        </div>
      </motion.header>
      <motion.div className={`room-layout ${panel ? "panel-open" : ""}`} initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.08 }}>
        <motion.section className="room-stage" layout transition={panelTransition}>{stage}</motion.section>
        <AnimatePresence initial={false} mode="popLayout">
        {panel && (
          <motion.aside className="room-panel" layout key="room-panel" initial={shouldReduceMotion ? false : { opacity: 0, x: panelOffset, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: panelOffset, scale: 0.985 }} transition={panelTransition}>
            <div className="panel-title"><strong>{t(`room.${panel}`)}</strong><button onClick={() => setPanel(null)}><X /></button></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div className="panel-content" key={panel} initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}>
                {panel === "people" && <div className="people-list"><div className="person-avatar">{displayName.slice(0,1).toUpperCase()}</div><div><strong>{displayName}</strong><span>{t("room.you")}</span></div><Mic /></div>}
                {panel === "chat" && <><div className="messages">{messages.length === 0 ? <motion.div className="empty-chat" initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}><MessageCircle /><span>{t("room.chat")}</span></motion.div> : <AnimatePresence initial={false}>{messages.map((item, index) => <motion.div className="message" key={index} initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}><div className="message-meta"><strong>{item.name}</strong><time dateTime={new Date(item.sentAt).toISOString()}>{formatMessageTime(item.sentAt, i18n.language)}</time></div><p>{item.text}</p></motion.div>)}</AnimatePresence>}</div><form className="chat-form" onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("room.messagePlaceholder")} /><motion.button whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }} aria-label={t("room.send")}><Send /></motion.button></form></>}
                {panel === "details" && <div className="details-panel"><span>{t("room.details")}</span><code dir="ltr">{code}</code><motion.button whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }} onClick={() => void copy(location.href)} aria-live="polite">{copied ? <><Check />{t("common.copied")}</> : t("room.copyCode")}</motion.button></div>}
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        )}
        </AnimatePresence>
      </motion.div>
      <motion.footer className="room-controls" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.14 }}>
        <div className="room-meta"><strong>{result.meeting.title}</strong></div>
        <div className="main-controls">
          <button className={!micOn ? "control-off" : ""} onClick={() => setMicOn(!micOn)} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
          <button className={!cameraOn ? "control-off" : ""} onClick={() => setCameraOn(!cameraOn)} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
          <button title={t("room.present")}><MonitorUp /></button>
          <button className="desktop-secondary-action" title={t("room.raiseHand")}><Hand /></button>
          <button className={`mobile-panel-action ${panel === "chat" ? "active" : ""}`} aria-label={t("room.chat")} onClick={() => togglePanel("chat")} title={t("room.chat")}><MessageCircle /></button>
          <div className="mobile-more-wrap" ref={mobileMenuRef}>
            <button className="mobile-more" aria-label={t("room.more")} aria-haspopup="menu" aria-controls="mobile-actions-menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} title={t("room.more")}><MoreHorizontal /></button>
            <AnimatePresence>
              {mobileMenuOpen && <motion.div id="mobile-actions-menu" className="mobile-actions-menu" role="menu" aria-orientation="vertical" initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
                <button className={panel === "details" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("details")}><Info /><span>{t("room.details")}</span></button>
                <button className={panel === "people" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("people")}><Users /><span>{t("room.people")}</span><em>1</em></button>
              </motion.div>}
            </AnimatePresence>
          </div>
          <button className="hangup" onClick={() => setConfirmLeave(true)} title={t("room.leave")}><PhoneOff /></button>
        </div>
        <div className="side-controls desktop-secondary-controls">
          <button aria-label={t("room.details")} className={panel === "details" ? "active" : ""} onClick={() => togglePanel("details")}><Info /></button>
          <button aria-label={t("room.people")} className={panel === "people" ? "active" : ""} onClick={() => togglePanel("people")}><Users /><span>1</span></button>
          <button aria-label={t("room.chat")} className={panel === "chat" ? "active" : ""} onClick={() => togglePanel("chat")}><MessageCircle /></button>
        </div>
      </motion.footer>
      <AnimatePresence>
        {confirmLeave && <motion.div className="leave-overlay" role="presentation" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}><motion.div className="leave-dialog" role="dialog" aria-modal="true" initial={shouldReduceMotion ? false : { opacity: 0, y: 22, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}><motion.div className="leave-icon" initial={shouldReduceMotion ? false : { rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.08 }}><PhoneOff /></motion.div><h2>{t("room.leaveTitle")}</h2><p>{t("room.leaveBody")}</p><div><button onClick={() => setConfirmLeave(false)}>{t("room.stay")}</button><button className="danger" onClick={onLeave}>{t("room.leaveNow")}</button>{result.role === "host" && <button className="danger-outline" onClick={onEnd}>{t("room.end")}</button>}</div></motion.div></motion.div>}
      </AnimatePresence>
    </motion.div>
  )
}
