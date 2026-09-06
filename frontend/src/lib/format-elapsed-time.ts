export function formatElapsedTime(elapsedMilliseconds: number, locale: string) {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMilliseconds / 1000))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60
  const twoDigits = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  })

  return [hours, minutes, seconds].map((part) => twoDigits.format(part)).join(":")
}
