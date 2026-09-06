import { useCallback, useEffect, useRef, useState } from "react"

const COPY_FEEDBACK_DURATION = 3000

export function useCopyFeedback() {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)

    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      setCopied(false)
      resetTimer.current = null
    }, COPY_FEEDBACK_DURATION)
  }, [])

  return { copied, copy }
}
