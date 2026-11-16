// Trainingsbelastung je Einheit und daraus Fitness, Ermüdung, Form (CTL, ATL, TSB).
import { addDays, diffDays } from './dates'
import type { Kind } from './types'

/** Normalized Power: 30-s-Mittel, vierte Potenz, Mittelwert, vierte Wurzel. Werte im 1-s-Raster. */
export function normalizedPower(watts: number[]): number {
  if (watts.length === 0) return 0
  if (watts.length < 30) return watts.reduce((a, b) => a + b, 0) / watts.length
  let sum = 0
  for (let i = 0; i < 30; i++) sum += watts[i]
  let acc = 0
  let n = 0
  for (let i = 30; i <= watts.length; i++) {
    const avg = sum / 30
    acc += avg ** 4
    n++
    if (i < watts.length) sum += watts[i] - watts[i - 30]
  }
  return (acc / n) ** 0.25
}

/** TSS aus Leistung: Dauer × NP × IF / (FTP × 3600) × 100 */
export function tssPower(durationSec: number, np: number, ftp: number): number {
  if (ftp <= 0) return 0
  const iF = np / ftp
  return ((durationSec * np * iF) / (ftp * 3600)) * 100
}

/**
 * Belastung aus Herzfrequenz: TRIMP nach Banister, normiert so,
 * dass eine Stunde am Schwellenpuls 100 Punkte ergibt.
 */
export function tssHr(durationSec: number, avgHr: number, hrRest: number, hrMax: number, lthr: number, female = false): number {
  const k = female ? [0.86, 1.67] : [0.64, 1.92]
  const trimp = (min: number, hr: number) => {
    const x = Math.min(1, Math.max(0, (hr - hrRest) / (hrMax - hrRest)))
    return min * x * k[0] * Math.exp(k[1] * x)
  }
  const ref = trimp(60, lthr)
  if (ref <= 0) return 0
  return (trimp(durationSec / 60, avgHr) / ref) * 100
}

/** Belastung aus Lauftempo gegen Schwellentempo (beide s/km): Stunden × IF² × 100 */
export function tssPace(durationSec: number, paceSecKm: number, thresholdPaceSecKm: number): number {
  const iF = thresholdPaceSecKm / paceSecKm
  return (durationSec / 3600) * iF * iF * 100
}

/** Grobe Schätzung aus gefühlter Anstrengung (1–10) */
export function tssRpe(durationSec: number, rpe: number): number {
  const iF = 0.5 + 0.05 * Math.min(10, Math.max(1, rpe))
  return (durationSec / 3600) * iF * iF * 100
}

/** Typische Intensität (Anteil der Schwelle) einer ganzen Einheit je Art, für die geplante Belastung */
export const KIND_IF: Record<Kind, number> = {
  recovery: 0.55,
  easy: 0.65,
  long: 0.68,
  technique: 0.6,
  tempo: 0.8,
  threshold: 0.85,
  intervals: 0.88,
  hills: 0.85,
  brick: 0.75,
  strength: 0.6,
  mobility: 0.35,
  test: 0.9,
  race: 0.95,
}

export function plannedLoad(kind: Kind, durationMin: number): number {
  const iF = KIND_IF[kind]
  return Math.round((durationMin / 60) * iF * iF * 100)
}

export interface FormPoint {
  date: string
  load: number
  ctl: number
  atl: number
  tsb: number
}

/**
 * Fitness (CTL, 42 Tage), Ermüdung (ATL, 7 Tage) und Form (TSB = CTL − ATL vom Vortag)
 * als exponentiell gewichtete Mittel der Tagesbelastung.
 */
export function formCurve(daily: { date: string; load: number }[], until?: string): FormPoint[] {
  if (daily.length === 0) return []
  const byDate = new Map<string, number>()
  for (const d of daily) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.load)
  const dates = [...byDate.keys()].sort()
  const first = dates[0]
  const last = until && until > dates[dates.length - 1] ? until : dates[dates.length - 1]
  const out: FormPoint[] = []
  let ctl = 0
  let atl = 0
  for (let i = 0; i <= diffDays(last, first); i++) {
    const date = addDays(first, i)
    const load = byDate.get(date) ?? 0
    const tsb = ctl - atl
    ctl = ctl + (load - ctl) / 42
    atl = atl + (load - atl) / 7
    out.push({ date, load, ctl, atl, tsb })
  }
  return out
}
