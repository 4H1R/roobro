import { ConnectionQualityIndicator, LiveKitRoom, ParticipantName, ParticipantPlaceholder, ParticipantTile, RoomAudioRenderer, useParticipants, useRoomContext, useTracks, VideoTrack } from "@livekit/components-react"
import { DisconnectReason, RoomEvent, Track, setLogLevel, type RemoteParticipant, type Room } from "livekit-client"
import { Activity, Ban, Check, ChevronUp, Clock3, Copy, Info, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MonitorUp, Music2, MoreHorizontal, MoreVertical, PhoneOff, Send, ShieldCheck, SmilePlus, UserMinus, UserPlus, Users, Video, VideoOff, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import "@livekit/components-styles"

import { SharedPlaybackPanel } from "@/components/shared-playback-panel"
import { ConnectionStatsPanel, connectionLabel } from "@/components/connection-stats-panel"
import { useConnectionStats } from "@/hooks/use-connection-stats"
import { BrandMark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCopyFeedback } from "@/hooks/use-copy-feedback"
import { getMeetingChat, meetingStorageKey, sendMeetingChat, setMeetingChatHistory, type JoinResult, type StoredChatMessage } from "@/lib/api"
import { formatElapsedTime } from "@/lib/format-elapsed-time"
import { mergeChatMessages } from "@/lib/chat-history"
import { formatMessageTime } from "@/lib/format-message-time"
import { playMessageReceivedSound, playMessageSentSound, playParticipantJoinedSound, playParticipantLeftSound } from "@/lib/meeting-sounds"

// LiveKit emits recurring WebRTC stats at info level; keep production consoles quiet.
setLogLevel(import.meta.env.PROD ? "warn" : "info")

const MAX_CHAT_MESSAGE_LENGTH = 2_000
const REACTION_TOPIC = "roobro-reaction"
const REACTION_EMOJIS = ["💖", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"] as const
const REACTION_DURATION_SECONDS = 3.8
const MAX_VISIBLE_REACTIONS = 8
const REACTION_LANES = ["42%", "58%", "34%", "66%", "26%", "74%", "50%", "82%"] as const

type ReactionEmoji = typeof REACTION_EMOJIS[number]
type InputDeviceKind = "audioinput" | "videoinput"

interface MeetingRoomProps {
  result: JoinResult
  displayName: string
  code: string
  justCreated?: boolean
  cameraOn: boolean
  micOn: boolean
  onLeave: () => void
  onEnd: () => void
  onFinished: () => void
  onModerateParticipant?: (identity: string, ban: boolean) => Promise<void>
}

interface RoomParticipant {
  identity: string
  name?: string
  isLocal: boolean
  isMicrophoneEnabled: boolean
}

interface ChatMessage {
  id?: number
  name: string
  text: string
  sentAt: number
  isOwn: boolean
}

interface MeetingReaction {
  id: number
  emoji: ReactionEmoji
  name: string
  lane: typeof REACTION_LANES[number]
}

function decodeReaction(payload: Uint8Array, participant: RemoteParticipant): Pick<MeetingReaction, "emoji" | "name"> | null {
  try {
    const packet: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (!packet || typeof packet !== "object") return null

    const { emoji } = packet as { emoji?: unknown }
    if (typeof emoji !== "string" || !REACTION_EMOJIS.includes(emoji as ReactionEmoji)) return null

    return { emoji: emoji as ReactionEmoji, name: participant.name?.trim() || participant.identity }
  } catch {
    return null
  }
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
  const { t } = useTranslation()
  const room = useRoomContext()
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false })
  const participants = useParticipants()
  const shouldReduceMotion = useReducedMotion()
  const [focusedTrackKey, setFocusedTrackKey] = useState<string | null>(null)

  const getTrackKey = (track: (typeof tracks)[number]) => `${track.participant.identity}-${track.source}`
  const focusedTrack = tracks.find((track) => getTrackKey(track) === focusedTrackKey)
  const otherTracks = focusedTrack ? tracks.filter((track) => getTrackKey(track) !== focusedTrackKey) : []

  const renderTrack = (track: (typeof tracks)[number], focused = false) => {
    const key = getTrackKey(track)
    const participantName = track.participant.name?.trim() || track.participant.identity
    const isScreenShare = track.source === Track.Source.ScreenShare
    return (
      <motion.div
        className={`live-participant ${focused ? "focused-participant" : ""} ${isScreenShare ? "is-screen-share" : ""}`}
        layout
        layoutId={key}
        key={key}
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.28 }}
        onDoubleClick={() => setFocusedTrackKey(focused ? null : key)}
      >
        <ParticipantTile trackRef={track}>
          {isScreenShare ? <>
            <VideoTrack />
            <div className="lk-participant-placeholder"><ParticipantPlaceholder /></div>
            <div className="lk-participant-metadata">
              <div className="lk-participant-metadata-item">
                <MonitorUp style={{ marginInlineEnd: "0.25rem" }} />
                <ParticipantName participant={track.participant}> — {t("room.sharedScreen")}</ParticipantName>
              </div>
              <ConnectionQualityIndicator className="lk-participant-metadata-item" />
            </div>
          </> : undefined}
        </ParticipantTile>
        <button
          type="button"
          className="focus-tile-button"
          aria-label={focused ? t("room.restoreGrid") : t("room.focusTile", { name: participantName })}
          title={focused ? t("room.restoreGrid") : t("room.focusTile", { name: participantName })}
          onClick={() => setFocusedTrackKey(focused ? null : key)}
        >
          {focused ? <Minimize2 /> : <Maximize2 />}
        </button>
      </motion.div>
    )
  }

  useEffect(() => {
    const playJoinCue = () => void playParticipantJoinedSound()
    const playLeaveCue = () => void playParticipantLeftSound()
    room.on(RoomEvent.ParticipantConnected, playJoinCue)
    room.on(RoomEvent.ParticipantDisconnected, playLeaveCue)
    return () => {
      room.off(RoomEvent.ParticipantConnected, playJoinCue)
      room.off(RoomEvent.ParticipantDisconnected, playLeaveCue)
    }
  }, [room])

  useEffect(() => {
    if (focusedTrackKey && !tracks.some((track) => getTrackKey(track) === focusedTrackKey)) setFocusedTrackKey(null)
  }, [focusedTrackKey, tracks])

  useEffect(() => {
    if (!focusedTrackKey) return
    const restoreGridOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedTrackKey(null)
    }
    document.addEventListener("keydown", restoreGridOnEscape)
    return () => document.removeEventListener("keydown", restoreGridOnEscape)
  }, [focusedTrackKey])

  const stage = focusedTrack ? (
    <div className={`live-video-grid live-video-grid--focused ${otherTracks.length === 0 ? "live-video-grid--solo" : ""}`}>
      {otherTracks.length > 0 && <div className="participant-rail"><AnimatePresence initial={false}>{otherTracks.map((track) => renderTrack(track))}</AnimatePresence></div>}
      <AnimatePresence initial={false}>{renderTrack(focusedTrack, true)}</AnimatePresence>
    </div>
  ) : (
    <div className="live-video-grid"><AnimatePresence initial={false}>{tracks.map((track) => renderTrack(track))}</AnimatePresence></div>
  )

  return <RoomChrome {...props} room={room} participants={participants} stage={stage} live />
}

function DemoRoom(props: MeetingRoomProps) {
  const { t } = useTranslation()
  const stage = (
    <div className="demo-video-grid">
      <div className="demo-self"><span>{props.displayName.slice(0, 1).toUpperCase()}</span><em>{t("room.you")}</em></div>
      <div className="demo-waiting"><div className="waiting-orbit"><Users aria-hidden="true" /></div><div className="waiting-copy"><strong>{t("room.waiting")}</strong><code dir="ltr">{props.code}</code></div></div>
    </div>
  )
  return <RoomChrome {...props} stage={stage} live={false} />
}

function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const { t, i18n } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const viewportRef = useRef<HTMLDivElement>(null)
  const followingLatest = useRef(true)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (viewport && followingLatest.current) viewport.scrollTop = viewport.scrollHeight
  }, [messages])

  return (
    <div
      className="messages"
      ref={viewportRef}
      onScroll={(event) => {
        const viewport = event.currentTarget
        // Remember the position before the next message changes the scroll height.
        followingLatest.current = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 24
      }}
    >
      {messages.length === 0 ? (
        <motion.div className="empty-chat" initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
          <MessageCircle /><span>{t("room.chat")}</span>
        </motion.div>
      ) : (
        <AnimatePresence initial={false}>
          {messages.map((item, index) => (
            <motion.div className={`message ${item.isOwn ? "message-own" : "message-other"}`} key={item.id ?? index} initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}>
              <div className="message-meta"><strong>{item.name}</strong><time dateTime={new Date(item.sentAt).toISOString()}>{formatMessageTime(item.sentAt, i18n.language)}</time></div>
              <p>{item.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}

function RoomChrome({ result, displayName, code, justCreated = false, cameraOn: initialCamera, micOn: initialMic, onLeave, onEnd, onModerateParticipant, stage, live, room, participants = [] }: MeetingRoomProps & { stage: React.ReactNode; live: boolean; room?: Room; participants?: readonly RoomParticipant[] }) {
  const { t, i18n } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [cameraOn, setCameraOn] = useState(initialCamera)
  const [micOn, setMicOn] = useState(initialMic)
  const [screenSharing, setScreenSharing] = useState(room?.localParticipant?.isScreenShareEnabled ?? false)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const [reactions, setReactions] = useState<MeetingReaction[]>([])
  const [panel, setPanel] = useState<"people" | "chat" | "details" | "connection" | "playback" | null>(null)
  const [playbackExpanded, setPlaybackExpanded] = useState(false)
  useEffect(() => { if (panel !== "playback") setPlaybackExpanded(false) }, [panel])
  const diagnostics = useConnectionStats(room, panel === "connection")
  const connectionStatus = connectionLabel(diagnostics.connection, diagnostics.quality, !live)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [deviceMenu, setDeviceMenu] = useState<InputDeviceKind | null>(null)
  const [inputDevices, setInputDevices] = useState<Record<InputDeviceKind, MediaDeviceInfo[]>>({ audioinput: [], videoinput: [] })
  const [activeDevices, setActiveDevices] = useState<Partial<Record<InputDeviceKind, string>>>({})
  const [switchingDevice, setSwitchingDevice] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const leaveDialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirmLeave) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = leaveDialogRef.current
    dialog?.querySelector<HTMLButtonElement>("button")?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setConfirmLeave(false)
      }
      if (event.key !== "Tab" || !dialog) return
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("keydown", handleKey)
      previousFocus?.focus()
    }
  }, [confirmLeave])
  const [meetingReadyOpen, setMeetingReadyOpen] = useState(justCreated && result.role === "host")
  const [messages, setMessages] = useState<ChatMessage[]>(() => mergeChatMessages([], (result.chat?.messages ?? []).map((item) => ({ ...item, isOwn: item.identity === result.identity }))))
  const [chatHistoryEnabled, setChatHistoryEnabled] = useState(result.chat?.history_enabled ?? result.meeting.chat_history_enabled ?? true)
  const [savingChatSetting, setSavingChatSetting] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatPanelVisible = useRef(false)
  chatPanelVisible.current = panel === "chat"
  const lastPolledMessageID = useRef(Math.max(0, ...(result.chat?.messages.map((item) => item.id) ?? [])))
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [message, setMessage] = useState("")
  const [participantMenu, setParticipantMenu] = useState<string | null>(null)
  const [moderatingParticipant, setModeratingParticipant] = useState<string | null>(null)
  const joinedAt = useRef(Date.now())
  const [now, setNow] = useState(joinedAt.current)
  const { copied: shareCopied, copy: copySharedMeeting } = useCopyFeedback()
  const { copied: linkCopied, copy: copyMeetingLink } = useCopyFeedback()
  const { copied: detailsCopied, copy: copyMeetingDetailsLink } = useCopyFeedback()
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const mediaControlsRef = useRef<HTMLDivElement>(null)
  const nextReactionId = useRef(0)
  const enterTransition = { duration: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] as const }
  const panelTransition = { duration: shouldReduceMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] as const }
  const panelOffset = i18n.dir() === "rtl" ? -36 : 36
  const parsedMeetingStart = result.meeting.started_at ? Date.parse(result.meeting.started_at) : Number.NaN
  const meetingStartedAt = Number.isNaN(parsedMeetingStart) ? joinedAt.current : parsedMeetingStart
  const meetingDuration = formatElapsedTime(now - meetingStartedAt, i18n.language)
  const participantDuration = formatElapsedTime(now - joinedAt.current, i18n.language)
  const roster = participants.length > 0 ? participants : [{ identity: result.identity, name: displayName, isLocal: true, isMicrophoneEnabled: micOn }]
  const participantCount = roster.length
  const meetingUrl = typeof location === "undefined" ? code : location.href

  const showReaction = (emoji: ReactionEmoji, name: string) => {
    nextReactionId.current += 1
    const id = nextReactionId.current
    const lane = REACTION_LANES[(id - 1) % REACTION_LANES.length]
    setReactions((current) => [...current.slice(-(MAX_VISIBLE_REACTIONS - 1)), { id, emoji, name, lane }])
  }

  const togglePanel = (nextPanel: NonNullable<typeof panel>) => {
    if (panel === nextPanel) {
      setPanel(null)
      return
    }
    setMeetingReadyOpen(false)
    if (nextPanel === "chat") setUnreadMessageCount(0)
    setPanel(nextPanel)
  }

  const openPanelFromMobileMenu = (nextPanel: NonNullable<typeof panel>) => {
    setMobileMenuOpen(false)
    togglePanel(nextPanel)
  }

  const moderateParticipant = async (identity: string, ban: boolean) => {
    if (!onModerateParticipant || moderatingParticipant) return
    setModeratingParticipant(identity)
    try {
      await onModerateParticipant(identity, ban)
      setParticipantMenu(null)
    } catch {
      // The route reports the API error and leaves the menu open for retrying.
    } finally {
      setModeratingParticipant(null)
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (participantCount > 1) setMeetingReadyOpen(false)
  }, [participantCount])

  useEffect(() => {
    if (!room) return

    const receiveRoomData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (!participant) return
      if (topic === REACTION_TOPIC) {
        const incomingReaction = decodeReaction(payload, participant)
        if (incomingReaction) showReaction(incomingReaction.emoji, incomingReaction.name)
      }
    }

    room.on(RoomEvent.DataReceived, receiveRoomData)
    return () => { room.off(RoomEvent.DataReceived, receiveRoomData) }
  }, [room])

  useEffect(() => {
    if (!result.chat_token) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const chat = await getMeetingChat(code, result.chat_token!)
        if (stopped) return
        setChatHistoryEnabled(chat.history_enabled)
        const incoming = chat.messages.filter((item) => item.id > lastPolledMessageID.current)
        lastPolledMessageID.current = Math.max(lastPolledMessageID.current, ...chat.messages.map((item) => item.id))
        // Merge the bounded snapshot so enabling history can backfill older IDs
        // and a poll started before a local send cannot discard its response.
        setMessages((current) => mergeChatMessages(current, chat.messages.map((item) => ({ ...item, isOwn: item.identity === result.identity }))))
        if (incoming.length > 0) {
          const unread = incoming.filter((item) => item.identity !== result.identity && item.sentAt >= joinedAt.current).length
          if (unread > 0 && !(chatPanelVisible.current && document.visibilityState === "visible")) {
            setUnreadMessageCount((current) => current + unread)
            void playMessageReceivedSound()
          }
        }
      } catch {
        return
      } finally { if (!stopped) timer = setTimeout(refresh, 1000) }
    }
    void refresh()
    return () => { stopped = true; clearTimeout(timer) }
  }, [code, result.chat_token, result.identity])

  useEffect(() => {
    if (panel !== "chat") return
    const markVisibleChatAsRead = () => {
      if (document.visibilityState === "visible") setUnreadMessageCount(0)
    }
    document.addEventListener("visibilitychange", markVisibleChatAsRead)
    return () => document.removeEventListener("visibilitychange", markVisibleChatAsRead)
  }, [panel])

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

  useEffect(() => {
    if (!reactionPickerOpen) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!reactionPickerRef.current?.contains(event.target as Node)) setReactionPickerOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReactionPickerOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePress)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [reactionPickerOpen])

  useEffect(() => {
    if (!room) return
    const updateActiveDevice = (kind: MediaDeviceKind, deviceId: string) => {
      if (kind === "audioinput" || kind === "videoinput") {
        setActiveDevices((current) => ({ ...current, [kind]: deviceId }))
      }
    }
    room.on(RoomEvent.ActiveDeviceChanged, updateActiveDevice)
    return () => { room.off(RoomEvent.ActiveDeviceChanged, updateActiveDevice) }
  }, [room])

  useEffect(() => {
    if (!room) return
    const syncScreenSharing = () => setScreenSharing(room.localParticipant.isScreenShareEnabled)
    room.on(RoomEvent.LocalTrackPublished, syncScreenSharing)
    room.on(RoomEvent.LocalTrackUnpublished, syncScreenSharing)
    return () => {
      room.off(RoomEvent.LocalTrackPublished, syncScreenSharing)
      room.off(RoomEvent.LocalTrackUnpublished, syncScreenSharing)
    }
  }, [room])

  useEffect(() => {
    if (!deviceMenu) return

    const refreshDevices = async () => {
      try {
        let devices = await navigator.mediaDevices?.enumerateDevices()
        if (!devices) return
        const devicesOfKind = devices.filter((device) => device.kind === deviceMenu)
        if (devicesOfKind.length > 0 && devicesOfKind.every((device) => !device.label)) {
          try {
            const permissionStream = await navigator.mediaDevices.getUserMedia(deviceMenu === "audioinput" ? { audio: true } : { video: true })
            permissionStream.getTracks().forEach((track) => track.stop())
            devices = await navigator.mediaDevices.enumerateDevices()
          } catch {
            // Unnamed devices remain selectable if the user declines the prompt.
          }
        }
        setInputDevices({
          audioinput: devices.filter((device) => device.kind === "audioinput"),
          videoinput: devices.filter((device) => device.kind === "videoinput"),
        })
        const roomDevice = room?.getActiveDevice(deviceMenu)
        if (roomDevice) setActiveDevices((current) => ({ ...current, [deviceMenu]: roomDevice }))
      } catch {
        setInputDevices((current) => ({ ...current, [deviceMenu]: [] }))
      }
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!mediaControlsRef.current?.contains(event.target as Node)) setDeviceMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMenu(null)
    }

    void refreshDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices)
    document.addEventListener("pointerdown", closeOnOutsidePress)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices)
      document.removeEventListener("pointerdown", closeOnOutsidePress)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [deviceMenu, room])

  const toggleMicrophone = async () => {
    const enabled = !micOn
    try {
      if (room) await room.localParticipant.setMicrophoneEnabled(enabled)
      setMicOn(enabled)
    } catch {
      return
    }
  }

  const toggleCamera = async () => {
    const enabled = !cameraOn
    try {
      if (room) await room.localParticipant.setCameraEnabled(enabled)
      setCameraOn(enabled)
    } catch {
      return
    }
  }

  const toggleScreenShare = async () => {
    if (!room) return
    const enabled = !screenSharing
    try {
      await room.localParticipant.setScreenShareEnabled(enabled)
      setScreenSharing(enabled)
    } catch {
      return
    }
  }

  const selectDevice = async (kind: InputDeviceKind, deviceId: string) => {
    if (switchingDevice) return
    setSwitchingDevice(true)
    try {
      if (room) await room.switchActiveDevice(kind, deviceId)
      setActiveDevices((current) => ({ ...current, [kind]: deviceId }))
      setDeviceMenu(null)
    } catch {
      return
    } finally {
      setSwitchingDevice(false)
    }
  }

  const renderDeviceMenu = (kind: InputDeviceKind) => {
    if (deviceMenu !== kind) return null
    const devices = inputDevices[kind]

    return (
      <div className="device-menu" id={`${kind}-device-menu`} role="menu" aria-label={kind === "audioinput" ? t("room.chooseMicrophone") : t("room.chooseCamera")}>
        <div className="device-menu-title">{kind === "audioinput" ? <Mic /> : <Video />}<strong>{kind === "audioinput" ? t("room.microphone") : t("room.camera")}</strong></div>
        {devices.length > 0 ? devices.map((device, index) => {
          const selected = activeDevices[kind] === device.deviceId || (!activeDevices[kind] && device.deviceId === "default")
          return (
            <button key={device.deviceId || `${kind}-${index}`} className={selected ? "selected" : ""} disabled={switchingDevice} role="menuitemradio" aria-checked={selected} onClick={() => void selectDevice(kind, device.deviceId)}>
              <span>{device.label || t("room.unnamedDevice", { number: index + 1 })}</span>
              {selected && <Check />}
            </button>
          )
        }) : <span className="device-menu-empty">{t("room.noDevices")}</span>}
      </div>
    )
  }

  const sendReaction = async (emoji: ReactionEmoji) => {
    setReactionPickerOpen(false)
    showReaction(emoji, displayName)
    if (!room) return

    try {
      const payload = new TextEncoder().encode(JSON.stringify({ emoji }))
      await room.localParticipant.publishData(payload, { reliable: true, topic: REACTION_TOPIC })
    } catch {
      // The local reaction can still play when a transient network error prevents delivery.
    }
  }

  const appendStoredMessage = (item: StoredChatMessage) => {
    setMessages((current) => mergeChatMessages(current, [{ ...item, isOwn: item.identity === result.identity }]))
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || sendingMessage) return
    setSendingMessage(true)
    setChatError(null)
    try {
      if (result.chat_token) appendStoredMessage(await sendMeetingChat(code, result.chat_token, text))
      else setMessages((current) => mergeChatMessages(current, [{ name: displayName, text, sentAt: Date.now(), isOwn: true }]))
      setMessage((current) => current.trim() === text ? "" : current)
      void playMessageSentSound()
    } catch {
      setChatError(t("room.chatSendFailed"))
    } finally { setSendingMessage(false) }
  }

  const toggleChatHistory = async (enabled: boolean) => {
    if (savingChatSetting) return
    setSavingChatSetting(true)
    setChatError(null)
    try {
      if (result.chat_token) {
        const hostToken = sessionStorage.getItem(meetingStorageKey(code)) ?? ""
        const meeting = await setMeetingChatHistory(code, enabled, hostToken)
        setChatHistoryEnabled(meeting.chat_history_enabled ?? enabled)
      } else setChatHistoryEnabled(enabled)
    } catch { setChatError(t("room.chatSettingsFailed")) }
    finally { setSavingChatSetting(false) }
  }

  const shareMeeting = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: result.meeting.title, text: t("room.inviteShareText"), url: meetingUrl })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }

    await copySharedMeeting(meetingUrl)
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
          <button type="button" className="connection-state" data-quality={connectionStatus} aria-label={t("room.connection")} aria-expanded={panel === "connection"} onClick={() => togglePanel("connection")}><Activity aria-hidden="true" />{t(`connection.${connectionStatus}`)}</button>
          <ThemeToggle />
        </div>
      </motion.header>
      <motion.div className={`room-layout ${panel ? "panel-open" : ""}`} initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.08 }}>
        <motion.section className="room-stage" layout transition={panelTransition}>
          {stage}
          <div className="reaction-stream" role="status" aria-live="polite" aria-label={t("room.reactionAnnouncementArea")}>
            <AnimatePresence initial={false}>
              {reactions.map((reaction) => <motion.div className="reaction-bubble" key={reaction.id} style={{ "--reaction-lane": reaction.lane } as React.CSSProperties} initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.7 }} animate={shouldReduceMotion ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], y: [24, 0, -110, -210], scale: [0.7, 1.08, 1, 0.94] }} exit={{ opacity: 0 }} transition={{ duration: REACTION_DURATION_SECONDS, times: [0, 0.12, 0.78, 1], ease: "easeOut" }} onAnimationComplete={() => setReactions((current) => current.filter((item) => item.id !== reaction.id))} aria-label={t("room.reactionAnnouncement", { name: reaction.name, emoji: reaction.emoji })}><span>{reaction.emoji}</span><small>{reaction.name}</small></motion.div>)}
            </AnimatePresence>
          </div>
        </motion.section>
        <AnimatePresence>
          {meetingReadyOpen && participantCount === 1 && <motion.aside className="meeting-ready-card" role="dialog" aria-labelledby="meeting-ready-title" initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <div className="meeting-ready-header"><h2 id="meeting-ready-title">{t("room.meetingReady")}</h2><button aria-label={t("room.closeInvite")} onClick={() => setMeetingReadyOpen(false)}><X /></button></div>
            <motion.button className="invite-others" whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }} onClick={() => void shareMeeting()}><UserPlus />{shareCopied ? t("common.copied") : t("room.addOthers")}</motion.button>
            <p className="invite-copy">{t("room.inviteBody")}</p>
            <div className="meeting-link"><span dir="ltr">{meetingUrl}</span><button aria-label={t("room.copyLink")} onClick={() => void copyMeetingLink(meetingUrl)}>{linkCopied ? <Check /> : <Copy />}</button></div>
            <div className="invite-access-note"><span><ShieldCheck /></span><p>{t("room.inviteAccess")}</p></div>
            <p className="invite-identity">{t("room.joinedAs", { name: displayName })}</p>
          </motion.aside>}
        </AnimatePresence>
        <aside className={`room-panel playback-sidebar ${playbackExpanded ? "is-expanded" : ""}`} hidden={panel !== "playback"} data-panel="playback">
          <div className="panel-title"><strong>{t("room.playback")}</strong><button aria-label={t("playback.close")} onClick={() => setPanel(null)}><X /></button></div>
          <SharedPlaybackPanel room={room} identity={result.identity} displayName={displayName} expanded={playbackExpanded} onExpandedChange={setPlaybackExpanded} />
        </aside>
        <AnimatePresence initial={false} mode="popLayout">
        {panel && panel !== "playback" && (
          <motion.aside className="room-panel" layout key="room-panel" data-panel={panel} initial={shouldReduceMotion ? false : { opacity: 0, x: panelOffset, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: panelOffset, scale: 0.985 }} transition={panelTransition}>
            <div className="panel-title"><strong>{t(`room.${panel}`)}</strong><button aria-label={t("connection.close")} onClick={() => setPanel(null)}><X /></button></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div className="panel-content" key={panel} initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}>
                {panel === "people" && <div className="people-roster">{roster.map((participant) => {
                  const participantName = participant.name?.trim() || participant.identity || displayName
                  const canModerate = result.role === "host" && !participant.isLocal && onModerateParticipant
                  return <div className="people-list" key={participant.identity}><div className="person-avatar">{participantName.slice(0, 1).toUpperCase()}</div><div><strong>{participantName}</strong>{participant.isLocal && <span>{result.role === "host" ? `${t("room.you")} · ${t("room.host")}` : t("room.you")}</span>}</div><div className="participant-actions">{participant.isMicrophoneEnabled ? <Mic /> : <MicOff />}{canModerate && <button className="participant-menu-trigger" aria-label={t("room.participantOptions", { name: participantName })} aria-expanded={participantMenu === participant.identity} onClick={() => setParticipantMenu((current) => current === participant.identity ? null : participant.identity)}><MoreVertical /></button>}</div>{participantMenu === participant.identity && canModerate && <div className="participant-moderation-menu" role="menu"><button role="menuitem" disabled={moderatingParticipant === participant.identity} onClick={() => void moderateParticipant(participant.identity, false)}><UserMinus />{t("room.removeParticipant")}</button><button className="danger" role="menuitem" disabled={moderatingParticipant === participant.identity} onClick={() => void moderateParticipant(participant.identity, true)}><Ban />{t("room.banParticipant")}</button></div>}</div>
                })}</div>}
                {panel === "chat" && <><small>{t("room.chatRetention")}</small>{result.role === "host" && <label className="chat-history-setting"><input type="checkbox" role="switch" checked={chatHistoryEnabled} disabled={savingChatSetting} onChange={(event) => void toggleChatHistory(event.target.checked)} /><span><strong>{t("room.chatHistory")}</strong><small>{t("room.chatHistoryBody")}</small></span></label>}{chatError && <p className="chat-error" role="alert">{chatError}</p>}<ChatMessages messages={messages} /><form className="chat-form" onSubmit={send}><input aria-label={t("room.messagePlaceholder")} value={message} maxLength={MAX_CHAT_MESSAGE_LENGTH} onChange={(event) => setMessage(event.target.value)} placeholder={t("room.messagePlaceholder")} /><motion.button whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }} disabled={sendingMessage || !message.trim()} aria-label={t("room.send")}><Send /></motion.button></form></>}
                {panel === "connection" && <ConnectionStatsPanel diagnostics={diagnostics} demo={!live} />}
                {panel === "details" && <div className="details-panel"><span>{t("room.details")}</span><code dir="ltr">{code}</code><motion.button whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }} onClick={() => void copyMeetingDetailsLink(location.href)} aria-live="polite">{detailsCopied ? <><Check />{t("common.copied")}</> : t("room.copyCode")}</motion.button></div>}
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        )}
        </AnimatePresence>
      </motion.div>
      <motion.footer className="room-controls" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.14 }}>
        <div className="room-meta"><strong>{result.meeting.title}</strong></div>
        <div className="main-controls">
          <div className="media-device-controls" ref={mediaControlsRef}>
            <div className="media-control-group">
              <button className={`media-toggle ${!micOn ? "control-off" : ""}`} aria-label={micOn ? t("lobby.micOn") : t("lobby.micOff")} onClick={() => void toggleMicrophone()} title={micOn ? t("lobby.micOn") : t("lobby.micOff")}>{micOn ? <Mic /> : <MicOff />}</button>
              <button className={`device-menu-trigger ${deviceMenu === "audioinput" ? "active" : ""}`} aria-label={t("room.chooseMicrophone")} aria-haspopup="menu" aria-controls="audioinput-device-menu" aria-expanded={deviceMenu === "audioinput"} onClick={() => { setReactionPickerOpen(false); setDeviceMenu((current) => current === "audioinput" ? null : "audioinput") }} title={t("room.chooseMicrophone")}><ChevronUp /></button>
              {renderDeviceMenu("audioinput")}
            </div>
            <div className="media-control-group">
              <button className={`media-toggle ${!cameraOn ? "control-off" : ""}`} aria-label={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")} onClick={() => void toggleCamera()} title={cameraOn ? t("lobby.cameraOn") : t("lobby.cameraOff")}>{cameraOn ? <Video /> : <VideoOff />}</button>
              <button className={`device-menu-trigger ${deviceMenu === "videoinput" ? "active" : ""}`} aria-label={t("room.chooseCamera")} aria-haspopup="menu" aria-controls="videoinput-device-menu" aria-expanded={deviceMenu === "videoinput"} onClick={() => { setReactionPickerOpen(false); setDeviceMenu((current) => current === "videoinput" ? null : "videoinput") }} title={t("room.chooseCamera")}><ChevronUp /></button>
              {renderDeviceMenu("videoinput")}
            </div>
          </div>
          <button className={`desktop-secondary-action ${screenSharing ? "active" : ""}`} aria-label={t(screenSharing ? "room.stopPresenting" : "room.present")} aria-pressed={screenSharing} disabled={!room} onClick={() => void toggleScreenShare()} title={t(screenSharing ? "room.stopPresenting" : "room.present")}><MonitorUp /></button>
          <div className="reaction-control" ref={reactionPickerRef}>
            <button className={reactionPickerOpen ? "active" : ""} aria-label={t("room.reactions")} aria-haspopup="menu" aria-controls="reaction-picker" aria-expanded={reactionPickerOpen} onClick={() => { setMobileMenuOpen(false); setReactionPickerOpen((open) => !open) }} title={t("room.reactions")}><SmilePlus /></button>
            <AnimatePresence>
              {reactionPickerOpen && <motion.div id="reaction-picker" className="reaction-picker" role="menu" aria-label={t("room.reactions")} initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}>
                {REACTION_EMOJIS.map((emoji) => <motion.button key={emoji} type="button" role="menuitem" whileHover={shouldReduceMotion ? undefined : { scale: 1.2, y: -2 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }} transition={{ type: "tween", duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }} aria-label={t("room.sendReaction", { emoji })} onClick={() => void sendReaction(emoji)}><span aria-hidden="true">{emoji}</span></motion.button>)}
              </motion.div>}
            </AnimatePresence>
          </div>
          <button className={`mobile-panel-action ${panel === "chat" ? "active" : ""}`} aria-label={t("room.chat")} onClick={() => togglePanel("chat")} title={t("room.chat")}><MessageCircle />{unreadMessageCount > 0 && <span className="chat-unread-badge" aria-label={t("room.unreadMessages", { count: unreadMessageCount })}>{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>}</button>
          <div className="mobile-more-wrap" ref={mobileMenuRef}>
            <button className="mobile-more" aria-label={t("room.more")} aria-haspopup="menu" aria-controls="mobile-actions-menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} title={t("room.more")}><MoreHorizontal /></button>
            <AnimatePresence>
              {mobileMenuOpen && <motion.div id="mobile-actions-menu" className="mobile-actions-menu" role="menu" aria-orientation="vertical" initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
                <button role="menuitem" disabled={!room} onClick={() => { setMobileMenuOpen(false); void toggleScreenShare() }}><MonitorUp /><span>{t(screenSharing ? "room.stopPresenting" : "room.present")}</span></button>
                <button role="menuitem" onClick={() => { setMobileMenuOpen(false); setDeviceMenu("audioinput") }}><Mic /><span>{t("room.chooseMicrophone")}</span></button>
                <button role="menuitem" onClick={() => { setMobileMenuOpen(false); setDeviceMenu("videoinput") }}><Video /><span>{t("room.chooseCamera")}</span></button>
                <button className={panel === "playback" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("playback")}><Music2 /><span>{t("room.playback")}</span></button>
                <button className={panel === "connection" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("connection")}><Activity /><span>{t("room.connection")}</span></button>
                <button className={panel === "details" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("details")}><Info /><span>{t("room.details")}</span></button>
                <button className={panel === "people" ? "active" : ""} role="menuitem" onClick={() => openPanelFromMobileMenu("people")}><Users /><span>{t("room.people")}</span><em>{participantCount}</em></button>
              </motion.div>}
            </AnimatePresence>
          </div>
          <button aria-label={t("room.leave")} className="hangup" onClick={() => setConfirmLeave(true)} title={t("room.leave")}><PhoneOff /></button>
        </div>
        <div className="side-controls desktop-secondary-controls">
          <button aria-label={t("room.playback")} aria-expanded={panel === "playback"} className={panel === "playback" ? "active" : ""} onClick={() => togglePanel("playback")}><Music2 /></button>
          <button aria-label={t("room.details")} className={panel === "details" ? "active" : ""} onClick={() => togglePanel("details")}><Info /></button>
          <button aria-label={t("room.people")} className={panel === "people" ? "active" : ""} onClick={() => togglePanel("people")}><Users /><span>{participantCount}</span></button>
          <button aria-label={t("room.chat")} className={panel === "chat" ? "active" : ""} onClick={() => togglePanel("chat")}><MessageCircle />{unreadMessageCount > 0 && <span className="chat-unread-badge" aria-label={t("room.unreadMessages", { count: unreadMessageCount })}>{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>}</button>
        </div>
      </motion.footer>
      <AnimatePresence>
        {confirmLeave && <motion.div className="leave-overlay" role="presentation" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}><motion.div ref={leaveDialogRef} className="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title" initial={shouldReduceMotion ? false : { opacity: 0, y: 22, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}><motion.div className="leave-icon" initial={shouldReduceMotion ? false : { rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...enterTransition, delay: shouldReduceMotion ? 0 : 0.08 }}><PhoneOff /></motion.div><h2 id="leave-dialog-title">{t("room.leaveTitle")}</h2><p>{t("room.leaveBody")}</p><div><button onClick={() => setConfirmLeave(false)}>{t("room.stay")}</button><button className="danger" onClick={onLeave}>{t("room.leaveNow")}</button>{result.role === "host" && <button className="danger-outline" onClick={onEnd}>{t("room.end")}</button>}</div></motion.div></motion.div>}
      </AnimatePresence>
    </motion.div>
  )
}
