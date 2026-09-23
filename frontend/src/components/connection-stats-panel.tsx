import { Activity, ArrowDown, ArrowUp } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { useConnectionStats } from "@/hooks/use-connection-stats"

export function connectionLabel(connection: string, quality: string, demo: boolean) {
  if (demo) return "demo"
  if (connection !== "connected") return connection === "reconnecting" || connection === "signalReconnecting" ? "reconnecting" : connection === "connecting" ? "connecting" : "disconnected"
  return ["excellent", "good", "poor", "lost"].includes(quality) ? quality : "connected"
}

export function ConnectionStatsPanel({ diagnostics, demo }: { diagnostics: ReturnType<typeof useConnectionStats>; demo: boolean }) {
  const { t, i18n } = useTranslation()
  const { stats, status, connection, quality } = diagnostics
  const label = connectionLabel(connection, quality, demo)
  const format = (value: number | undefined, unit = "", digits = 1) => value === undefined ? t("connection.missing") : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits }).format(value)}${unit ? ` ${unit}` : ""}`
  const rate = (value: number | undefined) => value === undefined ? format(undefined) : value >= 1_000_000 ? format(value / 1_000_000, "Mbps", 2) : format(value / 1000, "kbps")
  const metric = (name: string, value: string) => <div className="connection-metric" key={name}><dt>{t(`connection.${name}`)}</dt><dd dir="auto">{value}</dd></div>

  return <section className="connection-panel" aria-label={t("room.connection")}>
    <div className="connection-summary" data-quality={label}><Activity aria-hidden="true" /><strong>{t(`connection.${label}`)}</strong></div>
    <p className="connection-note" role="status">{t(`connection.${demo ? "demoBody" : connection !== "connected" ? "waiting" : status}`)}</p>
    {!demo && connection === "connected" && <>
      <dl className="connection-metrics">
        {metric("ping", format(stats?.ping, "ms", 0))}
        {metric("jitter", format(stats?.jitter, "ms"))}
        {metric("loss", format(stats?.loss, "%"))}
        {metric("upload", rate(stats?.upload))}
        {metric("download", rate(stats?.download))}
        {metric("transport", stats?.protocols.length ? `${stats.protocols.join(" / ").toUpperCase()}${stats.relayed ? " · TURN" : ""}` : format(undefined))}
      </dl>
      <p className="connection-note">{t("connection.explanation")}</p>
      <div className="connection-streams">
        {stats?.streams.map((stream, index) => <details className="connection-stream" key={stream.id}>
          <summary>{stream.direction === "upload" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}<span>{t(`connection.${stream.direction}`)} · {t(`connection.source.${stream.source}`, { defaultValue: stream.kind === "audio" ? t("connection.audio") : t("connection.video") })} {format(index + 1, "", 0)}</span><b dir="auto">{rate(stream.bitrate)}</b></summary>
          <dl className="connection-stream-details">
            {metric("codec", stream.codec ?? format(undefined))}
            {metric("jitter", format(stream.jitter, "ms"))}
            {metric("loss", format(stream.loss, "%"))}
            {metric("packets", format(stream.packets, "", 0))}
            {metric("packetsLost", format(stream.packetsLost, "", 0))}
            {metric("bufferDelay", format(stream.bufferDelay, "ms"))}
            {stream.kind === "video" && <>
              {metric("resolution", stream.resolution ?? format(undefined))}
              {metric("fps", format(stream.fps, "fps"))}
              {metric("framesDropped", format(stream.framesDropped, "", 0))}
              {metric("freezes", format(stream.freezes, "", 0))}
              {stream.direction === "upload" && metric("limitation", stream.limitation ? t(`connection.limit.${stream.limitation}`, { defaultValue: stream.limitation }) : format(undefined))}
            </>}
          </dl>
        </details>)}
      </div>
      <p className="connection-note">{t("connection.availability")}</p>
    </>}
  </section>
}
