import { useCallback, useEffect, useRef, useState } from "react"

// Not yet in TypeScript's DOM lib; see https://developer.chrome.com/docs/web-platform/document-picture-in-picture
interface DocumentPictureInPicture {
  readonly window: Window | null
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}

const ENTER_PIP_ACTION = "enterpictureinpicture" as MediaSessionAction
const PIP_WINDOW_SIZE = { width: 360, height: 240 }
const MIRRORED_ROOT_ATTRIBUTES = ["lang", "dir", "data-theme", "style"]

function documentPictureInPicture() {
  if (typeof window === "undefined") return undefined
  return (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture
}

function setEnterPictureInPictureHandler(handler: MediaSessionActionHandler | null) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return false
  try {
    navigator.mediaSession.setActionHandler(ENTER_PIP_ACTION, handler)
    return true
  } catch {
    // Browsers that do not know the action throw instead of ignoring it.
    return false
  }
}

function mirrorRootAttributes(target: Document) {
  const source = document.documentElement
  for (const name of MIRRORED_ROOT_ATTRIBUTES) {
    const value = source.getAttribute(name)
    if (value === null) target.documentElement.removeAttribute(name)
    else target.documentElement.setAttribute(name, value)
  }
}

function copyStyles(target: Document) {
  const base = target.createElement("base")
  base.href = document.baseURI
  target.head.append(base)

  for (const sheet of Array.from(document.styleSheets)) {
    // Linked sheets stay links so their relative font and image URLs keep resolving against the sheet.
    if (sheet.href) {
      const link = target.createElement("link")
      link.rel = "stylesheet"
      link.href = sheet.href
      target.head.append(link)
      continue
    }
    const style = target.createElement("style")
    style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")
    target.head.append(style)
  }
}

export interface MeetingPictureInPicture {
  pipWindow: Window | null
  supported: boolean
  active: boolean
  toggle: () => Promise<void>
}

/**
 * Desktop Chromium floats a whole document (video plus controls) and opens it
 * by itself on tab switch during a call. Browsers without Document
 * Picture-in-Picture, including Chrome on Android, can only float a `<video>`.
 */
export function useMeetingPictureInPicture({ findFallbackVideo, onFallbackUnavailable }: {
  findFallbackVideo: () => HTMLVideoElement | null
  onFallbackUnavailable: () => void
}): MeetingPictureInPicture {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [videoPipActive, setVideoPipActive] = useState(false)
  const pipWindowRef = useRef<Window | null>(null)
  const fallbackRef = useRef({ findFallbackVideo, onFallbackUnavailable })
  fallbackRef.current = { findFallbackVideo, onFallbackUnavailable }

  const supported = !!documentPictureInPicture() || (typeof document !== "undefined" && document.pictureInPictureEnabled === true)

  const openDocumentWindow = useCallback(async (api: DocumentPictureInPicture) => {
    if (pipWindowRef.current) return
    const opened = await api.requestWindow(PIP_WINDOW_SIZE)
    copyStyles(opened.document)
    mirrorRootAttributes(opened.document)
    opened.document.body.classList.add("meeting-pip-body")
    opened.addEventListener("pagehide", () => {
      if (pipWindowRef.current === opened) pipWindowRef.current = null
      setPipWindow((current) => current === opened ? null : current)
    }, { once: true })
    pipWindowRef.current = opened
    setPipWindow(opened)
  }, [])

  const openVideoWindow = useCallback(async () => {
    const video = fallbackRef.current.findFallbackVideo()
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) {
      fallbackRef.current.onFallbackUnavailable()
      return
    }
    await video.requestPictureInPicture()
    setVideoPipActive(true)
    video.addEventListener("leavepictureinpicture", () => setVideoPipActive(false), { once: true })
  }, [])

  const open = useCallback(async () => {
    try {
      const api = documentPictureInPicture()
      if (api) await openDocumentWindow(api)
      else if (document.pictureInPictureEnabled) await openVideoWindow()
    } catch {
      // Rejected without a user gesture or while another window is open; staying in the tab is fine.
    }
  }, [openDocumentWindow, openVideoWindow])

  const close = useCallback(async () => {
    pipWindowRef.current?.close()
    pipWindowRef.current = null
    setPipWindow(null)
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => undefined)
    setVideoPipActive(false)
  }, [])

  const active = !!pipWindow || videoPipActive
  const toggle = useCallback(() => active ? close() : open(), [active, close, open])

  useEffect(() => {
    if (!setEnterPictureInPictureHandler(() => void open())) return
    return () => { setEnterPictureInPictureHandler(null) }
  }, [open])

  useEffect(() => {
    if (!pipWindow) return
    const observer = new MutationObserver(() => mirrorRootAttributes(pipWindow.document))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: MIRRORED_ROOT_ATTRIBUTES })
    return () => observer.disconnect()
  }, [pipWindow])

  useEffect(() => () => void close(), [close])

  return { pipWindow, supported, active, toggle }
}
