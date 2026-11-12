import { ParticipantTile, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

interface MeetingPipViewProps {
  pipWindow: Window
  spotlight: TrackReferenceOrPlaceholder | null
  displayName: string
  micOn: boolean
  cameraOn: boolean
  onToggleMicrophone: () => void
  onToggleCamera: () => void
  onLeave: () => void
}

export function MeetingPipView({ pipWindow, spotlight, displayName, micOn, cameraOn, onToggleMicrophone, onToggleCamera, onLeave }: MeetingPipViewProps) {
  const { t } = useTranslation()

  return createPortal(
    <div className="meeting-pip" data-lk-theme="default">
      <div className="meeting-pip-stage">
        {spotlight
          ? <ParticipantTile trackRef={spotlight} />
          : <div className="meeting-pip-avatar"><span>{displayName.slice(0, 1).toUpperCase()}</span></div>}
      </div>
      <div className="meeting-pip-controls">
        <button type="button" className={micOn ? "" : "control-off"} aria-label={micOn ? t("lobby.micOn") : t("lobby.micOff")} title={micOn ? t("lobby.micOn") : t("lobby.micOff")} onClick={onToggleMicrophone}>{micOn ? <Mic /> : <MicOff />}</button>
        <button type="button" className={cameraOn ? "" : "control-off"} aria-label={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")} onClick={onToggleCamera}>{cameraOn ? <Video /> : <VideoOff />}</button>
        <button type="button" className="hangup" aria-label={t("room.leave")} title={t("room.leave")} onClick={onLeave}><PhoneOff /></button>
      </div>
    </div>,
    pipWindow.document.body,
  )
}
