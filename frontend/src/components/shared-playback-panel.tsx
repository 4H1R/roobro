import type { Room } from "livekit-client"
import {
  Circle, CircleAlert, CircleCheck, Film, LoaderCircle, Lock, Maximize, Maximize2, Minimize, Minimize2, Music2, Pause, Play,
  RotateCcw, RotateCw, TriangleAlert, Upload, Users, Volume1, Volume2, VolumeX, X,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { useTranslation } from "react-i18next"

import { useSharedPlayback } from "@/hooks/use-shared-playback"
import { loadLocalPlaybackMedia, type LocalPlaybackMedia } from "@/lib/local-playback-media"
import { isAudioFileName, matchesMedia, playbackPosition, type PlaybackAttendee, type PlaybackMedia } from "@/lib/shared-playback"

const SKIP_SECONDS = 10
const EQUALIZER_BARS = 7

function timestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole / 60) % 60
  const rest = String(whole % 60).padStart(2, "0")
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`
}

function fileSize(bytes: number) {
  const megabytes = bytes / 1024 / 1024
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes.toFixed(1)} MB`
}

function statusIcon(status: PlaybackAttendee["status"]) {
  if (status === "ready" || status === "matching") return CircleCheck
  if (status === "error" || status === "mismatch" || status === "blocked") return CircleAlert
  if (status === "loading" || status === "buffering") return LoaderCircle
  return Circle
}

function FileSummary({ media, audio }: { media: PlaybackMedia; audio?: boolean }) {
  const Icon = audio ?? isAudioFileName(media.name) ? Music2 : Film
  return <div className="playback-file-summary">
    <span className="playback-file-icon"><Icon aria-hidden="true" /></span>
    <span className="playback-file-text">
      <strong dir="auto">{media.name}</strong>
      <span className="playback-file-details" dir="ltr">{timestamp(media.duration)} · {fileSize(media.size)}</span>
    </span>
  </div>
}

export function SharedPlaybackPanel({ room, identity, displayName, expanded = false, onExpandedChange, onSessionChange }: {
  room?: Room; identity: string; displayName?: string; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void
  onSessionChange?: (media: PlaybackMedia | null) => void
}) {
  const { t } = useTranslation()
  const playback = useSharedPlayback(room, identity, displayName)
  const [local, setLocal] = useState<LocalPlaybackMedia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [joinedSession, setJoinedSession] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState(0)
  const [seek, setSeek] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.7)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const selection = useRef<AbortController | null>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const autoJoined = useRef<string | null>(null)
  const playerId = useId()
  const session = playback.session
  const joined = !!session && joinedSession === session.id
  const matching = !!(local && session && matchesMedia(local.media, session.media))
  const enabled = matching && joined && playback.ready && !error
  const priming = joining && matching && playback.ready && !error
  const current = useRef({ session, enabled, blocked, priming })
  current.current = { session, enabled, blocked, priming }

  useEffect(() => () => selection.current?.abort(), [])
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url) }, [local])
  useEffect(() => {
    if (!video.current) return
    video.current.volume = volume
    video.current.muted = muted
  }, [volume, muted, local])
  useEffect(() => { setJoinedSession(null); setJoining(false); setSeek(null); setPosition(0); setBuffering(false); setConfirmEnd(false) }, [session?.id])

  const sessionMedia = session?.media ?? null
  useEffect(() => { onSessionChange?.(sessionMedia) }, [session?.id])

  const presenceStatus = loading ? "loading" : error ? "error" : !local ? "empty" : !matching || !playback.ready ? "selected" : blocked ? "blocked" : joining || buffering && joined ? "buffering" : !joined ? "selected" : "ready"
  const { reportPresence } = playback
  useEffect(() => {
    reportPresence({
      sessionId: session?.id ?? null,
      media: local ? { fingerprint: local.media.fingerprint, size: local.media.size, duration: local.media.duration } : null,
      status: presenceStatus,
    })
  }, [reportPresence, local, session?.id, presenceStatus])

  useEffect(() => {
    if (!expanded) return
    const restore = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) { event.preventDefault(); onExpandedChange?.(false); expandButton.current?.focus() }
    }
    document.addEventListener("keydown", restore)
    return () => document.removeEventListener("keydown", restore)
  }, [expanded, onExpandedChange])

  useEffect(() => {
    const sync = () => setFullscreen(!!player.current && document.fullscreenElement === player.current)
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  // Keep one player mounted while switching sidebar panels. Corrections never emit user commands.
  useEffect(() => {
    let active = true
    let starting = false
    const update = () => {
      const player = video.current
      const { session: state, enabled: canPlay, blocked: needsGesture, priming: preparing } = current.current
      if (!player) return
      if (!state || !canPlay) { if (!preparing && !player.paused) player.pause(); return }
      const now = performance.now()
      const target = playbackPosition(state, now)
      setPosition(target)
      if (player.readyState < 1) return
      const drift = target - player.currentTime
      if (Math.abs(drift) > 0.35 || (!state.playing && Math.abs(drift) > 0.03)) player.currentTime = target
      player.playbackRate = state.playing && Math.abs(drift) > 0.06 && Math.abs(drift) <= 0.35 ? (drift > 0 ? 1.03 : 0.97) : 1
      const shouldPlay = state.playing && now >= state.anchor && target < state.media.duration
      if (!shouldPlay) { if (!player.paused) player.pause(); return }
      if (player.paused && !starting && !needsGesture) {
        starting = true
        void player.play().catch((reason: unknown) => {
          if (active && reason instanceof DOMException && reason.name === "NotAllowedError") setBlocked(true)
          else if (active && !(reason instanceof DOMException && reason.name === "AbortError")) setError(true)
        }).finally(() => { starting = false })
      }
    }
    const timer = setInterval(update, 100)
    document.addEventListener("visibilitychange", update)
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", update) }
  }, [])

  const choose = async (file?: File) => {
    if (!file) return
    selection.current?.abort()
    const controller = new AbortController()
    selection.current = controller
    if (video.current && !video.current.paused) video.current.pause()
    setLocal(null)
    setJoinedSession(null)
    setJoining(false)
    setError(false)
    setBlocked(false)
    setBuffering(false)
    setLoading(true)
    try {
      const result = await loadLocalPlaybackMedia(file, controller.signal)
      if (controller.signal.aborted) URL.revokeObjectURL(result.url)
      else setLocal(result)
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const unlock = () => {
    const player = video.current
    if (!player || !local || !session || joining) return
    setBlocked(false)
    setError(false)
    setJoining(true)
    player.currentTime = playbackPosition(session, performance.now())
    // Invoke play in the click handler so browsers can grant audible playback.
    const source = player.src
    void player.play().then(() => {
      if (player.src !== source || !player.isConnected || current.current.session?.id !== session?.id) return
      setJoinedSession(session?.id ?? null)
      if (!current.current.session?.playing || !current.current.enabled) player.pause()
    }).catch((reason: unknown) => {
      if (!player.isConnected || player.src !== source || current.current.session?.id !== session.id) return
      if (reason instanceof DOMException && reason.name === "NotAllowedError") setBlocked(true)
      else if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true)
    }).finally(() => {
      if (player.isConnected && player.src === source && current.current.session?.id === session.id) setJoining(false)
    })
  }

  // Most browsers allow playback after the click that joined the meeting; when they don't, the
  // NotAllowedError path surfaces an explicit "enable audio" button that retries inside a gesture.
  useEffect(() => {
    if (!matching || joined || joining || blocked || error || !playback.ready || !session || !local) return
    const attempt = `${session.id}:${local.url}`
    if (autoJoined.current === attempt) return
    autoJoined.current = attempt
    unlock()
  }, [matching, joined, joining, blocked, error, playback.ready, session?.id, local?.url])

  const playing = !!session?.playing && position < session.media.duration
  const duration = session?.media.duration ?? local?.media.duration ?? 0
  const shownPosition = seek ?? position
  const progress = duration ? Math.min(100, (shownPosition / duration) * 100) : 0

  const readyCount = playback.attendees.filter((attendee) => attendee.status === "ready").length
  const allReady = !!session && playback.attendees.length > 0 && readyCount === playback.attendees.length
  const mismatch = !!(local && session && !matching)
  const showStage = !!local && (!session || matching)
  const canFullscreen = !!local && !local.audio && typeof document !== "undefined" && document.fullscreenEnabled

  const commitSeek = () => {
    if (seek !== null && local && enabled) playback.control("seek", local.media, seek)
    setSeek(null)
  }
  const togglePlay = () => { if (local && enabled) playback.control(playing ? "pause" : "play", local.media) }
  const skip = (delta: number) => {
    if (local && enabled) playback.control("seek", local.media, Math.min(Math.max(0, position + delta), duration))
  }
  const changeVolume = (value: number) => { setVolume(value); setMuted(value === 0) }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void player.current?.requestFullscreen().catch(() => undefined)
  }
  const shortcuts = (event: ReactKeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.code === "Space" && event.target instanceof HTMLButtonElement) return
    const actions: Record<string, () => void> = {
      Space: togglePlay, KeyK: togglePlay,
      ArrowLeft: () => skip(-SKIP_SECONDS), ArrowRight: () => skip(SKIP_SECONDS),
      KeyM: () => setMuted((value) => !value),
      KeyF: () => { if (canFullscreen) toggleFullscreen() },
    }
    const action = actions[event.code]
    if (!action || !matching || !joined) return
    event.preventDefault()
    action()
  }

  const audible = enabled && playing && !buffering
  const effectiveVolume = muted ? 0 : volume
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  const notice = !playback.ready ? { key: "playback.reconnecting", tone: "warning" } : playback.failed ? { key: "playback.sendFailed", tone: "error" }
    : mismatch ? { key: "playback.mismatch", tone: "warning" } : null
  const stageStatus = !session ? "playback.preview" : !joined ? "" : buffering ? "playback.buffering" : playing ? "playback.synced" : "playback.paused"
  const stageTone = !session ? "idle" : buffering ? "busy" : playing ? "live" : "paused"

  return <section className={`shared-playback ${expanded ? "is-expanded" : ""}`} aria-label={t("room.playback")}>
    <p role="status" className="playback-notice" data-tone={notice?.tone}>{notice && <><TriangleAlert aria-hidden="true" />{t(notice.key)}</>}</p>

    <div className={`playback-player ${fullscreen ? "is-fullscreen" : ""}`} id={playerId} ref={player} hidden={!showStage}
      role="group" aria-label={t("playback.player")} onKeyDown={shortcuts}>
      <div className="playback-screen" data-audio={local?.audio || undefined} data-playing={audible || undefined}
        onDoubleClick={() => canFullscreen ? toggleFullscreen() : onExpandedChange?.(!expanded)}>
        <video ref={video} src={local?.url} playsInline preload="auto" disablePictureInPicture
          aria-label={t("playback.player")} onError={() => { if (local) setError(true) }}
          onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)} />
        {local?.audio && <div className="playback-art" aria-hidden="true">
          <div className="playback-equalizer">{Array.from({ length: EQUALIZER_BARS }, (_, index) => <span key={index} style={{ "--bar": index } as CSSProperties} />)}</div>
          <strong dir="auto">{local.media.name}</strong>
        </div>}
        <span className="playback-pill" data-tone={stageTone} role="status">{stageStatus && <><i aria-hidden="true" />{t(stageStatus)}</>}</span>
      </div>

      {error && <p role="alert" className="playback-error"><CircleAlert aria-hidden="true" />{t("playback.unsupported")}</p>}

      {local && !session && <button className="playback-primary" disabled={!playback.ready || error} onClick={() => playback.start(local.media)}>
        <Users aria-hidden="true" />{t("playback.start")}
      </button>}
      {matching && (!joined || blocked) && <button className="playback-primary" disabled={!playback.ready || error || joining} onClick={unlock}>
        {joining ? <LoaderCircle className="playback-spin" aria-hidden="true" /> : blocked ? <Volume2 aria-hidden="true" /> : <Play aria-hidden="true" />}
        {t(joining ? "playback.joining" : blocked ? "playback.enableAudio" : "playback.join")}
      </button>}

      {matching && joined && <div className="playback-controls">
        <div className="playback-timeline" dir="ltr">
          <input type="range" className="playback-seek" aria-label={t("playback.seek")} aria-valuetext={`${timestamp(shownPosition)} / ${timestamp(duration)}`}
            min="0" max={duration} step="0.1" value={shownPosition} disabled={!enabled} style={{ "--progress": `${progress}%` } as CSSProperties}
            onChange={(event) => setSeek(Number(event.target.value))} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => setSeek(null)} />
          <div className="playback-times"><span>{timestamp(shownPosition)}</span><span>{timestamp(duration)}</span></div>
        </div>
        <div className="playback-transport" dir="ltr">
          <div className="playback-transport-main">
            <button type="button" className="playback-icon-button" disabled={!enabled} aria-label={t("playback.back", { seconds: SKIP_SECONDS })} title={t("playback.back", { seconds: SKIP_SECONDS })} onClick={() => skip(-SKIP_SECONDS)}><RotateCcw /></button>
            <button type="button" className="playback-play" disabled={!enabled} aria-label={t(playing ? "playback.pause" : "playback.play")} title={t(playing ? "playback.pause" : "playback.play")} onClick={togglePlay}>
              {playing ? <Pause /> : <Play />}
            </button>
            <button type="button" className="playback-icon-button" disabled={!enabled} aria-label={t("playback.forward", { seconds: SKIP_SECONDS })} title={t("playback.forward", { seconds: SKIP_SECONDS })} onClick={() => skip(SKIP_SECONDS)}><RotateCw /></button>
          </div>
          <div className="playback-volume">
            <button type="button" className="playback-icon-button" aria-label={t(muted ? "playback.unmute" : "playback.mute")} aria-pressed={muted} title={t(muted ? "playback.unmute" : "playback.mute")} onClick={() => setMuted((value) => !value)}><VolumeIcon /></button>
            <input type="range" aria-label={t("playback.volume")} min="0" max="1" step="0.01" value={effectiveVolume} style={{ "--progress": `${effectiveVolume * 100}%` } as CSSProperties}
              onChange={(event) => changeVolume(Number(event.target.value))} />
          </div>
          <div className="playback-view-actions">
            {onExpandedChange && !fullscreen && <button ref={expandButton} type="button" className="playback-icon-button playback-expand" aria-controls={playerId} aria-expanded={expanded}
              aria-label={t(expanded ? "playback.restore" : "playback.expand")} title={t(expanded ? "playback.restore" : "playback.expand")}
              onClick={() => onExpandedChange(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>}
            {canFullscreen && <button type="button" className="playback-icon-button" aria-label={t(fullscreen ? "playback.exitFullscreen" : "playback.fullscreen")} title={t(fullscreen ? "playback.exitFullscreen" : "playback.fullscreen")} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </button>}
          </div>
        </div>
        <p className="playback-hint">{!playing && session && !allReady ? t("playback.waitingHint") : t("playback.controlsHint")}</p>
      </div>}
    </div>

    <div className="playback-lobby">
      {!local && !session && !loading && <div className="playback-empty">
        <div className="playback-empty-art" aria-hidden="true"><Film /><Music2 /></div>
        <h3>{t("playback.emptyTitle")}</h3>
        <ol className="playback-steps">
          <li>{t("playback.stepChoose")}</li>
          <li>{t("playback.stepMatch")}</li>
          <li>{t("playback.stepWatch")}</li>
        </ol>
      </div>}

      {session && <div className={`playback-session ${matching ? "is-matching" : ""}`}>
        <small>{t(matching ? "playback.nowShared" : "playback.sharedFile")}</small>
        <FileSummary media={session.media} audio={matching ? local?.audio : undefined} />
        {matching && <span className="playback-match"><CircleCheck aria-hidden="true" />{t("playback.fileMatches")}</span>}
        {!local && !loading && <p>{t("playback.needFile")}</p>}
      </div>}

      {local && !session && <div className="playback-session is-local">
        <small>{t("playback.yourFile")}</small>
        <FileSummary media={local.media} audio={local.audio} />
      </div>}

      {(!local || mismatch) ? <button type="button" className={`playback-drop ${dragging ? "is-dragging" : ""}`} disabled={loading}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]) }}>
        <span className="playback-drop-icon">{loading ? <LoaderCircle className="playback-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}</span>
        <strong>{t(loading ? "playback.loading" : session ? "playback.chooseCopy" : "playback.chooseFile")}</strong>
        {!loading && <small>{mismatch ? <bdi>{local!.media.name}</bdi> : t("playback.formats")}</small>}
      </button> : <button type="button" className="playback-change" disabled={loading} onClick={() => input.current?.click()}>
        <Upload aria-hidden="true" />{t("playback.changeFile")}
      </button>}
      <input ref={input} type="file" accept="audio/*,video/*,.mkv,.flac,.opus" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = "" }} />
      {error && !showStage && <p role="alert" className="playback-error"><CircleAlert aria-hidden="true" />{t("playback.unsupported")}</p>}

      <div className="playback-readiness">
        <div className="playback-readiness-heading">
          <Users aria-hidden="true" /><strong>{t("playback.everyone")}</strong>
          {session && <span dir="ltr">{readyCount}/{playback.attendees.length}</span>}
        </div>
        {session && <>
          <div className="playback-meter" aria-hidden="true"><span style={{ width: `${playback.attendees.length ? (readyCount / playback.attendees.length) * 100 : 0}%` }} /></div>
          <p className={`playback-ready-summary ${allReady ? "all-ready" : ""}`} role="status">{t(allReady ? "playback.allReady" : "playback.readyCount", { ready: readyCount, total: playback.attendees.length })}</p>
        </>}
        <ul aria-label={t("playback.everyone")}>
          {playback.attendees.map((attendee) => {
            const StatusIcon = statusIcon(attendee.status)
            return <li key={attendee.identity} data-status={attendee.status}>
              <span className="playback-avatar" aria-hidden="true">{attendee.name.slice(0, 1).toUpperCase()}<StatusIcon /></span>
              <div><strong><bdi>{attendee.name}</bdi>{attendee.isLocal && <small> · {t("room.you")}</small>}</strong><span>{t(`playback.readiness.${attendee.status}`)}</span></div>
            </li>
          })}
        </ul>
      </div>

      {session && (confirmEnd ? <div className="playback-end-confirm" role="group" aria-label={t("playback.stopConfirm")}>
        <span>{t("playback.stopConfirm")}</span>
        <div>
          <button type="button" autoFocus onClick={() => setConfirmEnd(false)}>{t("playback.cancel")}</button>
          <button type="button" className="danger" disabled={!playback.ready} onClick={() => { setConfirmEnd(false); playback.end() }}>{t("playback.stopNow")}</button>
        </div>
      </div> : <button type="button" className="playback-end" disabled={!playback.ready} onClick={() => setConfirmEnd(true)}><X aria-hidden="true" />{t("playback.stop")}</button>)}

      <p className="playback-privacy"><Lock aria-hidden="true" />{t("playback.description")}</p>
      {!room && <p className="playback-note">{t("playback.demo")}</p>}
    </div>
  </section>
}
