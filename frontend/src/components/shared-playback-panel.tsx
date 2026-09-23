import type { Room } from "livekit-client"
import { CheckCircle2, Circle, CircleAlert, LoaderCircle, Maximize2, Minimize2, Music2, Pause, Play, Upload, Users, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useSharedPlayback } from "@/hooks/use-shared-playback"
import { loadLocalPlaybackMedia, type LocalPlaybackMedia } from "@/lib/local-playback-media"
import { matchesMedia, playbackPosition } from "@/lib/shared-playback"

function timestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

export function SharedPlaybackPanel({ room, identity, displayName, expanded = false, onExpandedChange }: {
  room?: Room; identity: string; displayName?: string; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void
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
  const video = useRef<HTMLVideoElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const selection = useRef<AbortController | null>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
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
  useEffect(() => { if (video.current) video.current.volume = volume }, [volume, local])
  useEffect(() => { setJoinedSession(null); setJoining(false); setSeek(null); setPosition(0); setBuffering(false) }, [session?.id])

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
      if (event.key === "Escape") { event.preventDefault(); onExpandedChange?.(false); expandButton.current?.focus() }
    }
    document.addEventListener("keydown", restore)
    return () => document.removeEventListener("keydown", restore)
  }, [expanded, onExpandedChange])

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

  const commitSeek = () => {
    if (seek !== null && local && enabled) playback.control("seek", local.media, seek)
    setSeek(null)
  }
  const playing = !!session?.playing && position < session.media.duration

  const readyCount = playback.attendees.filter((attendee) => attendee.status === "ready").length
  const allReady = !!session && playback.attendees.length > 0 && readyCount === playback.attendees.length

  return <section className={`shared-playback ${expanded ? "is-expanded" : ""}`} aria-label={t("room.playback")}>
    <div className="playback-player" id={playerId}>
      {local && <div className="playback-player-heading"><span><Music2 aria-hidden="true" />{t("playback.player")}</span>
        {onExpandedChange && <button ref={expandButton} type="button" className="playback-expand" aria-controls={playerId} aria-expanded={expanded}
          aria-label={t(expanded ? "playback.restore" : "playback.expand")} title={t(expanded ? "playback.restore" : "playback.expand")}
          onClick={() => onExpandedChange(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>}
      </div>}
      <div className="playback-screen" hidden={!local} data-audio={local?.audio || undefined} onDoubleClick={() => onExpandedChange?.(!expanded)}>
        {local?.audio && <Music2 className="playback-audio-art" aria-hidden="true" />}
        <video ref={video} src={local?.url} playsInline preload="auto" disablePictureInPicture
          aria-label={t("playback.player")} onError={() => { if (local) setError(true) }}
          onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)} />
      </div>
      <div role="status" className="playback-status">
        {!playback.ready ? t("playback.reconnecting") : playback.failed ? t("playback.sendFailed") : loading ? t("playback.loading") :
          local && session && !matching ? t("playback.mismatch") : session && !local ? t("playback.needFile") :
            buffering && enabled ? t("playback.buffering") : matching && joined ? t(playing ? "playback.synced" : "playback.paused") : ""}
      </div>
      {error && <p role="alert" className="playback-error">{t("playback.unsupported")}</p>}
      {local && !session && <button className="playback-primary" disabled={!playback.ready || error} onClick={() => playback.start(local.media)}>{t("playback.start")}</button>}
      {matching && (!joined || blocked) && <button className="playback-primary" disabled={!playback.ready || error || joining} onClick={unlock}>{t(joining ? "playback.joining" : blocked ? "playback.enableAudio" : "playback.join")}</button>}
      {matching && joined && <div className="playback-controls">
        <div className="playback-transport">
          <button disabled={!enabled} aria-label={t(playing ? "playback.pause" : "playback.play")} onClick={() => {
            if (local) playback.control(playing ? "pause" : "play", local.media)
          }}>{playing ? <Pause /> : <Play />}<span>{t(playing ? "playback.pause" : "playback.play")}</span></button>
          <span dir="ltr">{timestamp(seek ?? position)} / {timestamp(session!.media.duration)}</span>
        </div>
        {!playing && !allReady && <p className="playback-note">{t("playback.waitingHint")}</p>}
        <label className="playback-slider"><span>{t("playback.seek")}</span><input type="range" dir="ltr" min="0" max={session!.media.duration} step="0.1" value={seek ?? position} disabled={!enabled}
          onChange={(event) => setSeek(Number(event.target.value))} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => setSeek(null)} /></label>
      </div>}
      {local && <label className="playback-slider"><span>{t("playback.volume")}</span><input type="range" dir="ltr" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>}
    </div>
    <div className="playback-lobby">
      {!room && <p className="playback-note">{t("playback.demo")}</p>}
      <p className="playback-instructions">{t(session ? "playback.sessionInstructions" : "playback.setupInstructions")}</p>
      {session && <div className="playback-session"><small>{t("playback.sharedFile")}</small><strong dir="auto">{session.media.name}</strong>
        <span className="playback-file-details" dir="ltr">{timestamp(session.media.duration)} · {(session.media.size / 1024 / 1024).toFixed(1)} MB</span>
      </div>}
      <button type="button" className={`playback-drop ${dragging ? "is-dragging" : ""} ${matching ? "is-matching" : ""}`} disabled={loading}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]) }}>
        {matching ? <CheckCircle2 aria-hidden="true" /> : <Upload aria-hidden="true" />}<span>{t(loading ? "playback.loading" : local ? "playback.changeFile" : "playback.chooseFile")}</span>
        {local && <small dir="auto">{local.media.name}</small>}
        {matching && <em>{t("playback.fileMatches")}</em>}
      </button>
      <input ref={input} type="file" accept="audio/*,video/*,.mkv,.flac,.opus" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = "" }} />
      <p className="playback-note">{t("playback.description")}</p>
      <div className="playback-readiness">
        <div className="playback-readiness-heading"><Users aria-hidden="true" /><strong>{t("playback.everyone")}</strong></div>
        <p className={`playback-ready-summary ${allReady ? "all-ready" : ""}`} role="status">{t(allReady ? "playback.allReady" : "playback.readyCount", { ready: readyCount, total: playback.attendees.length })}</p>
        <ul aria-label={t("playback.everyone")}>
          {playback.attendees.map((attendee) => {
            const StatusIcon = attendee.status === "ready" || attendee.status === "matching" ? CheckCircle2 : ["error", "mismatch", "blocked"].includes(attendee.status) ? CircleAlert : ["loading", "buffering"].includes(attendee.status) ? LoaderCircle : Circle
            return <li key={attendee.identity} data-status={attendee.status}>
              <StatusIcon aria-hidden="true" /><div><strong><bdi>{attendee.name}</bdi>{attendee.isLocal && <small> · {t("room.you")}</small>}</strong><span>{t(`playback.readiness.${attendee.status}`)}</span></div>
            </li>
          })}
        </ul>
      </div>
      {session && <button className="playback-end" disabled={!playback.ready} onClick={playback.end}><X aria-hidden="true" />{t("playback.stop")}</button>}
      <small className="playback-note">{t("playback.controlsHint")}</small>
    </div>
  </section>
}
