import { fingerprintMedia, type PlaybackMedia } from "@/lib/shared-playback"

export type LocalPlaybackMedia = { url: string; media: PlaybackMedia; audio: boolean }

/** The caller owns the returned object URL. No file bytes leave the browser. */
export async function loadLocalPlaybackMedia(file: File, signal: AbortSignal): Promise<LocalPlaybackMedia> {
  if (!file.size || signal.aborted) throw new Error("unavailable")
  const url = URL.createObjectURL(file)
  const probe = document.createElement("video")
  probe.preload = "metadata"
  try {
    const fingerprint = await fingerprintMedia(file)
    if (signal.aborted) throw new Error("aborted")
    const duration = await new Promise<number>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        probe.onloadedmetadata = null
        probe.onerror = null
        if (error) reject(error)
        else resolve(probe.duration)
      }
      const abort = () => finish(new Error("aborted"))
      const timer = setTimeout(() => finish(new Error("timeout")), 15000)
      signal.addEventListener("abort", abort, { once: true })
      probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 && probe.duration <= 604800 ? undefined : new Error("duration"))
      probe.onerror = () => finish(new Error("unsupported"))
      probe.src = url
    })
    if (signal.aborted) throw new Error("aborted")
    return { url, media: { fingerprint, duration, size: file.size, name: file.name.slice(0, 255) || "media" }, audio: file.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i.test(file.name) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  } finally {
    probe.removeAttribute("src")
    probe.load()
  }
}
