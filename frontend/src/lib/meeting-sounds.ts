let audioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === "undefined") return null
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return null
  audioContext ??= new AudioContextConstructor()
  return audioContext
}

export function prepareMeetingSounds() {
  const context = getAudioContext()
  if (context?.state === "suspended") void context.resume().catch(() => undefined)
}

export async function playParticipantJoinedSound() {
  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === "suspended") await context.resume()

    const start = context.currentTime + 0.01
    const notes = [
      { frequency: 523.25, offset: 0, duration: 0.24, volume: 0.12 },
      { frequency: 659.25, offset: 0.07, duration: 0.28, volume: 0.1 },
      { frequency: 783.99, offset: 0.14, duration: 0.34, volume: 0.08 },
    ]

    for (const note of notes) {
      const noteStart = start + note.offset
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(note.frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
      oscillator.start(noteStart)
      oscillator.stop(noteStart + note.duration)
    }
  } catch {
    // Audio cues are optional and may be blocked by browser autoplay policies.
  }
}

export async function playParticipantLeftSound() {
  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === "suspended") await context.resume()

    const start = context.currentTime + 0.01
    const notes = [
      { frequency: 659.25, offset: 0, duration: 0.28, volume: 0.1 },
      { frequency: 523.25, offset: 0.1, duration: 0.34, volume: 0.08 },
    ]

    for (const note of notes) {
      const noteStart = start + note.offset
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(note.frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
      oscillator.start(noteStart)
      oscillator.stop(noteStart + note.duration)
    }
  } catch {
    // Audio cues are optional and may be blocked by browser autoplay policies.
  }
}

export async function playMessageSentSound() {
  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === "suspended") await context.resume()

    const start = context.currentTime + 0.01
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(740, start)
    oscillator.frequency.exponentialRampToValueAtTime(988, start + 0.12)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.07, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect()
      gain.disconnect()
    }, { once: true })
    oscillator.start(start)
    oscillator.stop(start + 0.16)
  } catch {
    // Audio cues are optional and may be blocked by browser autoplay policies.
  }
}

export async function playMessageReceivedSound() {
  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === "suspended") await context.resume()

    const start = context.currentTime + 0.01
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(587.33, start)
    oscillator.frequency.exponentialRampToValueAtTime(783.99, start + 0.16)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect()
      gain.disconnect()
    }, { once: true })
    oscillator.start(start)
    oscillator.stop(start + 0.22)
  } catch {
    // Audio cues are optional and may be blocked by browser autoplay policies.
  }
}
