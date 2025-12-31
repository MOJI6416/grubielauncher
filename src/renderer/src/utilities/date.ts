export function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}.${month}.${year} ${hours}:${minutes}`
}

export function formatTime(
  seconds: number,
  t: {
    h: string
    m: string
    s: string
  }
): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []
  if (hrs > 0) parts.push(`${hrs}${t.h}`)
  if (mins > 0) parts.push(`${mins}${t.m}`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs.toFixed(0)}${t.s}`)

  return parts.join(' ')
}
