import { useEffect, useRef, useState } from "react"

export type MediaAccessError = "permissionBlocked" | "devicesUnavailable" | "mediaUnsupported"
export type MediaAccess =
  | { status: "checking" | "requesting" | "granted" }
  | { status: "needed"; error?: MediaAccessError }

function mediaAccessError(error: unknown): MediaAccessError {
  return typeof error === "object" && error !== null && "name" in error
    && (error.name === "NotAllowedError" || error.name === "SecurityError")
    ? "permissionBlocked"
    : "devicesUnavailable"
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useLobbyMedia(active: boolean) {
  const [access, setAccess] = useState<MediaAccess>({ status: "checking" })
  const [cameraOn, setCameraOn] = useState(false)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const generationRef = useRef(0)
  const requestingRef = useRef(false)

  useEffect(() => {
    const generation = ++generationRef.current
    let microphonePermission: PermissionStatus | null = null
    const updateAccess = () => {
      if (generationRef.current !== generation) return
      if (microphonePermission?.state !== "granted") {
        setAccess((current) => current.status === "granted" ? { status: "needed", error: "permissionBlocked" } : current)
      } else if (!requestingRef.current) {
        setAccess({ status: "granted" })
      }
    }
    const checkAccess = async () => {
      try {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName })
        if (generationRef.current !== generation) return
        microphonePermission = result
        microphonePermission.addEventListener?.("change", updateAccess)
        setAccess({ status: microphonePermission.state === "granted" ? "granted" : "needed" })
      } catch {
        if (generationRef.current === generation) setAccess({ status: "needed" })
      }
    }
    void checkAccess()
    return () => {
      generationRef.current++
      microphonePermission?.removeEventListener?.("change", updateAccess)
    }
  }, [])

  const requestAccess = async () => {
    if (access.status !== "needed" || requestingRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setAccess({ status: "needed", error: "mediaUnsupported" })
      return
    }
    const generation = generationRef.current
    requestingRef.current = true
    setAccess({ status: "requesting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      stopStream(stream)
      if (generationRef.current !== generation) return
      setAccess({ status: "granted" })
    } catch (error) {
      if (generationRef.current === generation) setAccess({ status: "needed", error: mediaAccessError(error) })
    } finally {
      requestingRef.current = false
    }
  }

  useEffect(() => {
    if (!active || access.status !== "granted" || !cameraOn) return
    let cancelled = false
    let stream: MediaStream | null = null
    const video = videoRef.current
    const disablePreview = () => {
      if (cancelled) return
      setPreviewUnavailable(true)
      setCameraOn(false)
    }
    const preview = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        disablePreview()
        return
      }
      try {
        const result = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) { stopStream(result); return }
        stream = result
        setPreviewUnavailable(false)
        if (video) video.srcObject = stream
      } catch {
        disablePreview()
      }
    }
    void preview()
    return () => {
      cancelled = true
      stopStream(stream)
      if (video) video.srcObject = null
    }
  }, [active, access.status, cameraOn])

  return { access, requestAccess, cameraOn, setCameraOn, videoRef, previewUnavailable }
}
