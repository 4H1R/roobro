export type TextSegment = { type: "text"; text: string } | { type: "link"; text: string; href: string }

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
// Punctuation that usually ends a sentence rather than belonging to the URL.
const TRAILING_PUNCTUATION = /[.,;:!?'"،؛)\]}]+$/

export function linkifyText(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "")
    const start = match.index
    if (start > cursor) segments.push({ type: "text", text: text.slice(cursor, start) })
    segments.push({ type: "link", text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` })
    cursor = start + url.length
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) })
  return segments
}
