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
  const [cameraOn, setCameraOn] = useState(true)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const generationRef = useRef(0)
  const requestingRef = useRef(false)

  useEffect(() => {
    const generation = ++generationRef.current
    let permissions: PermissionStatus[] = []
    const revokeAccess = () => {
      if (generationRef.current !== generation) return
      if (permissions.some((permission) => permission.state !== "granted")) {
        setAccess((current) => current.status === "granted" ? { status: "needed", error: "permissionBlocked" } : current)
      }
    }
    const checkAccess = async () => {
      try {
        const result = await Promise.all([
          navigator.permissions.query({ name: "camera" as PermissionName }),
          navigator.permissions.query({ name: "microphone" as PermissionName }),
        ])
        if (generationRef.current !== generation) return
        permissions = result
        permissions.forEach((permission) => permission.addEventListener?.("change", revokeAccess))
        setAccess({ status: permissions.every((permission) => permission.state === "granted") ? "granted" : "needed" })
      } catch {
        if (generationRef.current === generation) setAccess({ status: "needed" })
      }
    }
    void checkAccess()
    return () => {
      generationRef.current++
      permissions.forEach((permission) => permission.removeEventListener?.("change", revokeAccess))
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stopStream(stream)
      if (generationRef.current !== generation) return
      setPreviewUnavailable(false)
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
    const preview = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setAccess({ status: "needed", error: "mediaUnsupported" })
          return
        }
        const result = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) { stopStream(result); return }
        stream = result
        setPreviewUnavailable(false)
        if (video) video.srcObject = stream
      } catch (error) {
        if (cancelled) return
        if (mediaAccessError(error) === "permissionBlocked") {
          setAccess({ status: "needed", error: "permissionBlocked" })
        } else {
          setPreviewUnavailable(true)
          setCameraOn(false)
        }
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
