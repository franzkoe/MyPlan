// Datumsrechnung auf lokalen Kalendertagen (YYYY-MM-DD), ohne Zeitzonenfallen.

export const pad = (n: number) => String(n).padStart(2, '0')

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parse(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function today(): string {
  return iso(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
}

/** 0 = Montag … 6 = Sonntag */
export function weekday(s: string): number {
  return (parse(s).getDay() + 6) % 7
}

/** erster Tag der Woche, in der s liegt. weekStart: 0 = Montag, 6 = Sonntag */
export function startOfWeek(s: string, weekStart = 0): string {
  const off = (weekday(s) - weekStart + 7) % 7
  return addDays(s, -off)
}

export function isoWeek(s: string): number {
  const d = parse(startOfWeek(s, 0))
  d.setDate(d.getDate() + 3)
  const jan4 = new Date(d.getFullYear(), 0, 4, 12)
  const w1 = parse(startOfWeek(iso(jan4), 0))
  return 1 + Math.round((d.getTime() - 3 * 86400000 - w1.getTime()) / (7 * 86400000))
}

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function fmtDate(s: string, withYear = false): string {
  const d = parse(s)
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`
}

export function fmtDateShort(s: string): string {
  const d = parse(s)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`
}

export function fmtDay(s: string): string {
  return `${WEEKDAYS[weekday(s)]}, ${fmtDate(s)}`
}

/** 3725 -> "1:02:05", 185 -> "3:05" */
export function fmtTime(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

/** Minuten als "45 min" oder "1:30 h" */
export function fmtDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}:${pad(m % 60)} h`
}

/** "1:45:30" oder "45:30" oder "45" (Minuten) -> Sekunden */
export function parseTime(text: string): number | undefined {
  const t = text.trim()
  if (!t) return undefined
  const parts = t.split(':').map((x) => Number(x.replace(',', '.')))
  if (parts.some((x) => !isFinite(x) || x < 0)) return undefined
  if (parts.length === 1) return parts[0] * 60
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}

export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
