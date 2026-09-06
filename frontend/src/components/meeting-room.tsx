import { AudioTrack, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useLocalParticipant, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"
import { Captions, Hand, Info, MessageCircle, Mic, MicOff, MonitorUp, MoreHorizontal, PhoneOff, Send, Users, Video, VideoOff, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import "@livekit/components-styles"

import { BrandMark } from "@/components/brand-mark"
import type { JoinResult } from "@/lib/api"

interface MeetingRoomProps {
  result: JoinResult
  displayName: string
  code: string
  cameraOn: boolean
  micOn: boolean
  onLeave: () => void
  onEnd: () => void
}

export function MeetingRoom(props: MeetingRoomProps) {
  if (props.result.demo || !props.result.token || !props.result.server_url) return <DemoRoom {...props} />
  return (
    <LiveKitRoom serverUrl={props.result.server_url} token={props.result.token} audio={props.micOn} video={props.cameraOn} className="meeting-room lk-room" data-lk-theme="default" onDisconnected={props.onLeave}>
      <LiveRoomShell {...props} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function LiveRoomShell(props: MeetingRoomProps) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false })
  return <RoomChrome {...props} stage={<div className="live-video-grid">{tracks.map((track) => <ParticipantTile key={`${track.participant.identity}-${track.source}`} trackRef={track} />)}</div>} live />
}

function DemoRoom(props: MeetingRoomProps) {
  const { t } = useTranslation()
  const stage = (
    <div className="demo-video-grid">
      <div className="demo-self"><span>{props.displayName.slice(0, 1).toUpperCase()}</span><em>{t("room.you")}</em></div>
      <div className="demo-waiting"><div className="waiting-orbit"><Users /></div><strong>{t("room.waiting")}</strong><code dir="ltr">{props.code}</code></div>
    </div>
  )
  return <RoomChrome {...props} stage={stage} live={false} />
}

function RoomChrome({ result, displayName, code, cameraOn: initialCamera, micOn: initialMic, onLeave, onEnd, stage, live }: MeetingRoomProps & { stage: React.ReactNode; live: boolean }) {
  const { t } = useTranslation()
  const [cameraOn, setCameraOn] = useState(initialCamera)
  const [micOn, setMicOn] = useState(initialMic)
  const [panel, setPanel] = useState<"people" | "chat" | "details" | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [messages, setMessages] = useState<Array<{ name: string; text: string }>>([])
  const [message, setMessage] = useState("")

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    setMessages((current) => [...current, { name: displayName, text: message.trim() }])
    setMessage("")
  }

  return (
    <div className="room-chrome">
      <header className="room-header">
        <div><span className="room-brand"><BrandMark className="room-brand-mark" />{t("brand.name")}</span><i /> <strong>{result.meeting.title}</strong></div>
        <div className="connection-state"><span />{live ? t("room.connected") : t("room.demo")}</div>
      </header>
      <div className={`room-layout ${panel ? "panel-open" : ""}`}>
        <section className="room-stage">{stage}<div className="meeting-code"><Info /><code dir="ltr">{code}</code></div></section>
        {panel && (
          <aside className="room-panel">
            <div className="panel-title"><strong>{t(`room.${panel}`)}</strong><button onClick={() => setPanel(null)}><X /></button></div>
            {panel === "people" && <div className="people-list"><div className="person-avatar">{displayName.slice(0,1).toUpperCase()}</div><div><strong>{displayName}</strong><span>{t("room.you")}</span></div><Mic /></div>}
            {panel === "chat" && <><div className="messages">{messages.length === 0 ? <div className="empty-chat"><MessageCircle /><span>{t("room.chat")}</span></div> : messages.map((item, index) => <div className="message" key={index}><strong>{item.name}</strong><p>{item.text}</p></div>)}</div><form className="chat-form" onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("room.messagePlaceholder")} /><button aria-label={t("room.send")}><Send /></button></form></>}
            {panel === "details" && <div className="details-panel"><span>{t("room.details")}</span><code dir="ltr">{code}</code><button onClick={() => navigator.clipboard.writeText(location.href)}>{t("room.copyCode")}</button></div>}
          </aside>
        )}
      </div>
      <footer className="room-controls">
        <div className="room-meta"><strong>{result.meeting.title}</strong><code dir="ltr">{code}</code></div>
        <div className="main-controls">
          <button className={!micOn ? "control-off" : ""} onClick={() => setMicOn(!micOn)} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
          <button className={!cameraOn ? "control-off" : ""} onClick={() => setCameraOn(!cameraOn)} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
          <button title={t("room.present")}><MonitorUp /></button>
          <button title={t("room.raiseHand")}><Hand /></button>
          <button title={t("room.more")}><MoreHorizontal /></button>
          <button className="hangup" onClick={() => setConfirmLeave(true)} title={t("room.leave")}><PhoneOff /></button>
        </div>
        <div className="side-controls">
          <button className={panel === "details" ? "active" : ""} onClick={() => setPanel(panel === "details" ? null : "details")}><Info /></button>
          <button className={panel === "people" ? "active" : ""} onClick={() => setPanel(panel === "people" ? null : "people")}><Users /><span>1</span></button>
          <button className={panel === "chat" ? "active" : ""} onClick={() => setPanel(panel === "chat" ? null : "chat")}><MessageCircle /></button>
          <button><Captions /></button>
        </div>
      </footer>
      {confirmLeave && <div className="leave-overlay"><div className="leave-dialog"><div className="leave-icon"><PhoneOff /></div><h2>{t("room.leaveTitle")}</h2><p>{t("room.leaveBody")}</p><div><button onClick={() => setConfirmLeave(false)}>{t("room.stay")}</button><button className="danger" onClick={onLeave}>{t("room.leaveNow")}</button>{result.role === "host" && <button className="danger-outline" onClick={onEnd}>{t("room.end")}</button>}</div></div></div>}
    </div>
  )
}
