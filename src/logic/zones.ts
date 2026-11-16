// Zonen, Tempobereiche und Kennwerte. Quellen und Grenzen: docs/trainingslehre.md
import { fmtTime, today } from './dates'
import { latest, validAt, type Profile, type Source } from './types'

export interface Zone {
  n: number
  name: string
  lo: number
  hi: number
}

export const HR_ZONE_NAMES = ['Regeneration', 'Grundlage', 'Tempo', 'Schwelle', 'Maximal']
export const POWER_ZONE_NAMES = ['Aktive Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO2max', 'Anaerob', 'Sprint']

/** Schätzung des Maximalpulses nach Tanaka (2001): 208 − 0,7 × Alter. Streuung etwa ±10 Schläge. */
export function estimateHrMax(birthYear: number, year = new Date().getFullYear()): number {
  return Math.round(208 - 0.7 * (year - birthYear))
}

export function effectiveHrMax(p: Profile): { value: number; source: Source } | undefined {
  if (p.hrMax) return { value: p.hrMax, source: 'user' }
  if (p.birthYear) return { value: estimateHrMax(p.birthYear), source: 'estimate' }
  return undefined
}

const PCT_MAX = [0.5, 0.6, 0.7, 0.8, 0.9]
const PCT_LTHR_RUN = [0.7, 0.85, 0.9, 0.95, 1.0]
const PCT_LTHR_BIKE = [0.68, 0.81, 0.9, 0.94, 1.0]

function fromBounds(lows: number[], top: number): Zone[] {
  const l = lows.map((x) => Math.round(x))
  return l.map((lo, i) => ({ n: i + 1, name: HR_ZONE_NAMES[i], lo, hi: i < l.length - 1 ? l[i + 1] - 1 : Math.round(top) }))
}

export interface HrZoneResult {
  zones: Zone[]
  method: Profile['hrMethod']
  basis: string
  source: Source
}

/** Herzfrequenzzonen 1–5 für Laufen oder Rad. undefined, wenn die nötigen Werte fehlen. */
export function hrZones(p: Profile, discipline: 'run' | 'bike' = 'run'): HrZoneResult | undefined {
  const bike = discipline === 'bike' ? p.bikeHr : undefined
  if (bike?.manual && bike.manual.length === 5) {
    return { zones: fromBounds(bike.manual, bike.hrMax ?? bike.manual[4] + 15), method: 'manual', basis: 'von Hand festgelegt (Rad)', source: 'user' }
  }
  if (p.hrMethod === 'manual' && p.hrManual && p.hrManual.length === 5) {
    return { zones: fromBounds(p.hrManual, p.hrMax ?? p.hrManual[4] + 15), method: 'manual', basis: 'von Hand festgelegt', source: 'user' }
  }
  const lthr = bike?.lthr ?? p.lthr
  const max = bike?.hrMax ? { value: bike.hrMax, source: 'user' as Source } : effectiveHrMax(p)
  if (p.hrMethod === 'lthr' && lthr) {
    const pct = discipline === 'bike' ? PCT_LTHR_BIKE : PCT_LTHR_RUN
    return {
      zones: fromBounds(pct.map((x) => x * lthr), Math.max(max?.value ?? 0, lthr * 1.06)),
      method: 'lthr',
      basis: `aus Schwellenpuls ${lthr}`,
      source: 'user',
    }
  }
  if (p.hrMethod === 'karvonen' && max && p.hrRest) {
    const r = p.hrRest
    return {
      zones: fromBounds(PCT_MAX.map((x) => r + x * (max.value - r)), max.value),
      method: 'karvonen',
      basis: `aus Maximalpuls ${max.value} und Ruhepuls ${r} (Herzfrequenzreserve)`,
      source: max.source,
    }
  }
  if (max) {
    return {
      zones: fromBounds(PCT_MAX.map((x) => x * max.value), max.value),
      method: 'max',
      basis: max.source === 'estimate' ? `aus geschätztem Maximalpuls ${max.value} (Alter)` : `aus Maximalpuls ${max.value}`,
      source: max.source,
    }
  }
  return undefined
}

export function zoneOf(zones: Zone[], value: number): number {
  let z = 0
  for (const zone of zones) if (value >= zone.lo) z = zone.n
  return z
}

/** Leistungszonen nach Coggan aus der FTP */
export function powerZones(ftp: number): Zone[] {
  const lows = [0, 0.56, 0.76, 0.91, 1.06, 1.21, 1.51]
  return lows.map((x, i) => ({
    n: i + 1,
    name: POWER_ZONE_NAMES[i],
    lo: Math.round(x * ftp),
    hi: i < 6 ? Math.round(lows[i + 1] * ftp) - 1 : Math.round(ftp * 3),
  }))
}

// ---------- Laufen: VDOT nach Daniels und Gilbert ----------

/** Sauerstoffbedarf (ml/kg/min) bei Geschwindigkeit v in m/min */
export const vo2AtSpeed = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v

/** Anteil der VO2max, der über t Minuten gehalten werden kann */
export const fractionAtTime = (tMin: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)

export function speedAtVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

export function vdotFromRace(distanceM: number, timeSec: number): number {
  const t = timeSec / 60
  return vo2AtSpeed(distanceM / t) / fractionAtTime(t)
}

/** Prognose der Wettkampfzeit in Sekunden für eine Distanz bei gegebenem VDOT */
export function predictRace(vdot: number, distanceM: number): number {
  let lo = distanceM / 600 // schnellste denkbare Zeit in min (10 m/s)
  let hi = distanceM / 30 // langsamste (0,5 m/s)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (vdotFromRace(distanceM, mid * 60) > vdot) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 60
}

export interface Paces {
  /** s/km: lockerer Bereich [langsam, schnell] */
  E: [number, number]
  M: number
  T: number
  I: number
  R: number
}

const paceAt = (vdot: number, pct: number) => 60000 / speedAtVo2(vdot * pct)

export function pacesFromVdot(vdot: number): Paces {
  return {
    E: [paceAt(vdot, 0.62), paceAt(vdot, 0.72)],
    M: predictRace(vdot, 42195) / 42.195,
    T: paceAt(vdot, 0.88),
    I: paceAt(vdot, 0.98),
    R: predictRace(vdot, 1609.34) / 1.60934,
  }
}

export const vdotFromThresholdPace = (secPerKm: number) => vo2AtSpeed(60000 / secPerKm) / 0.88

export interface RunFitness {
  vdot: number
  source: 'race' | 'threshold' | 'vo2max'
  detail: string
  estimate: boolean
}

/** Lauf-Leistungsstand. Eine Wettkampfzeit aus den letzten 12 Monaten hat Vorrang, dann Schwellentempo, dann VO2max. */
export function runFitness(p: Profile, at = today()): RunFitness | undefined {
  const races = p.raceResults.filter((r) => r.date <= at).sort((a, b) => b.date.localeCompare(a.date))
  const yearAgo = `${Number(at.slice(0, 4)) - 1}${at.slice(4)}`
  const recent = races.find((r) => r.date >= yearAgo)
  const raceFit = (r: (typeof races)[number]): RunFitness => ({
    vdot: vdotFromRace(r.distanceM, r.timeSec),
    source: 'race',
    detail: `aus Wettkampfzeit ${fmtTime(r.timeSec)} über ${(r.distanceM / 1000).toLocaleString('de-DE')} km`,
    estimate: false,
  })
  if (recent) return raceFit(recent)
  const tp = validAt(p.thresholdPace, at)
  if (tp) return { vdot: vdotFromThresholdPace(tp.value), source: 'threshold', detail: `aus Schwellentempo ${fmtTime(tp.value)} min/km`, estimate: false }
  const vo2 = p.vo2max.filter((v) => v.sport === 'run' && v.date <= at).sort((a, b) => a.date.localeCompare(b.date))
  const v = vo2[vo2.length - 1] ?? p.vo2max.filter((x) => x.sport === 'run')[0]
  if (v) return { vdot: v.value, source: 'vo2max', detail: `aus VO2max ${v.value}${v.source === 'lab' ? ' (Labor)' : ' (Schätzwert der Uhr)'}`, estimate: v.source !== 'lab' }
  if (races[0]) return raceFit(races[0])
  return undefined
}

// ---------- Schwimmen ----------

/** Critical Swim Speed als Tempo in s/100 m aus 400-m- und 200-m-Testzeit (Sekunden) */
export function cssPace(t400: number, t200: number): number {
  return (t400 - t200) / 2
}

// ---------- Kraft ----------

/** Geschätztes 1RM nach Epley. Für mehr als etwa 10 Wiederholungen ungenau. */
export function epley(kg: number, reps: number): number {
  if (reps <= 1) return kg
  return kg * (1 + reps / 30)
}

export const roundKg = (kg: number, step = 2.5) => Math.round(kg / step) * step

// ---------- Vorgaben in Einheiten-Texten ----------

export interface Refs {
  paces?: Paces
  runFit?: RunFitness
  hrRun?: Zone[]
  hrBike?: Zone[]
  ftp?: number
  css?: number
  oneRm: Record<string, number>
  mi: boolean
  lb: boolean
}

export function refsFromProfile(p: Profile, at = today()): Refs {
  const fit = runFitness(p, at)
  const oneRm: Record<string, number> = {}
  for (const [k, v] of Object.entries(p.oneRm)) {
    const e = validAt(v, at)
    if (e) oneRm[k] = e.value
  }
  return {
    runFit: fit,
    paces: fit ? pacesFromVdot(fit.vdot) : undefined,
    hrRun: hrZones(p, 'run')?.zones,
    hrBike: hrZones(p, 'bike')?.zones,
    ftp: validAt(p.ftp, at)?.value,
    css: validAt(p.css, at)?.value,
    oneRm,
    mi: p.units.distance === 'mi',
    lb: p.units.weight === 'lb',
  }
}

export function fmtPace(secPerKm: number, mi = false): string {
  return fmtTime(mi ? secPerKm * 1.609344 : secPerKm)
}

const PACE_NAME: Record<string, string> = {
  E: 'locker',
  M: 'Marathontempo',
  T: 'Schwellentempo',
  I: 'Intervalltempo',
  R: 'Wiederholungstempo',
}
const PACE_FALLBACK: Record<string, string> = {
  E: 'lockerem Tempo, bei dem du dich unterhalten kannst',
  M: 'Marathontempo: zügig, aber über Stunden haltbar',
  T: 'Schwellentempo: das Tempo, das du etwa eine Stunde halten könntest',
  I: 'Intervalltempo: etwa dein Renntempo über 3 bis 5 km',
  R: 'Wiederholungstempo: etwa dein Renntempo über 1500 m, locker im Schritt',
}
const ZONE_FEEL = ['sehr locker', 'locker, Unterhaltung möglich', 'zügig, einzelne Sätze möglich', 'hart, nur einzelne Wörter', 'sehr hart']

function hrText(zones: Zone[] | undefined, spec: string): string {
  const [a, b] = spec.split('-').map(Number)
  const hiZ = b ?? a
  const label = hiZ === a ? `Zone ${a}` : `Zone ${a}–${hiZ}`
  if (!zones) return `${label} (${ZONE_FEEL[hiZ - 1]})`
  return `Puls ${zones[a - 1].lo}–${zones[hiZ - 1].hi} (${label})`
}

const pctToHrZone = (pct: number) => (pct < 56 ? 1 : pct < 76 ? 2 : pct < 91 ? 3 : pct < 106 ? 4 : 5)

/** Ersetzt Platzhalter durch die eigenen Werte. Fehlt ein Wert, steht eine Beschreibung nach Gefühl. */
export function renderText(text: string, r: Refs): string {
  return text.replace(/\{(\w+):([^}]+)\}/g, (_, type: string, arg: string) => {
    if (type === 'pace') {
      const race: Record<string, [number, string]> = { HM: [21097.5, 'Halbmarathontempo'], '10k': [10000, '10-km-Tempo'], '5k': [5000, '5-km-Tempo'] }
      if (race[arg]) {
        if (!r.runFit) return `deinem ${race[arg][1].replace('tempo', '-Renntempo').replace('--', '-')}`
        const sec = predictRace(r.runFit.vdot, race[arg][0]) / (race[arg][0] / 1000)
        return `${fmtPace(sec, r.mi)} ${r.mi ? 'min/mi' : 'min/km'} (${race[arg][1]})`
      }
      if (!r.paces) return PACE_FALLBACK[arg] ?? arg
      const unit = r.mi ? 'min/mi' : 'min/km'
      if (arg === 'E') return `${fmtPace(r.paces.E[0], r.mi)}–${fmtPace(r.paces.E[1], r.mi)} ${unit} (locker)`
      const v = r.paces[arg as 'M' | 'T' | 'I' | 'R']
      return `${fmtPace(v, r.mi)} ${unit} (${PACE_NAME[arg]})`
    }
    if (type === 'hr') return hrText(r.hrRun, arg)
    if (type === 'hrb') return hrText(r.hrBike ?? r.hrRun, arg)
    if (type === 'pw') {
      const [lo, hi] = arg.split('-').map(Number)
      if (r.ftp) return `${Math.round((lo / 100) * r.ftp)}–${Math.round((hi / 100) * r.ftp)} W`
      const za = pctToHrZone(lo)
      const zb = pctToHrZone(hi)
      return hrText(r.hrBike ?? r.hrRun, za === zb ? `${za}` : `${za}-${zb}`)
    }
    if (type === 'css') {
      const off = Number(arg)
      if (!r.css) return off < 0 ? 'schnellem Tempo' : off === 0 ? 'zügigem Tempo, das du gleichmäßig halten kannst' : 'ruhigem, gleichmäßigem Tempo'
      return `${fmtTime(r.css + off)} min/100 m`
    }
    return arg
  })
}

/** Arbeitsgewicht aus 1RM und Prozentwert, sonst undefined */
export function workWeight(r: Refs, exerciseId: string, pct?: number): number | undefined {
  const rm = r.oneRm[exerciseId]
  if (!rm || !pct) return undefined
  return roundKg((rm * pct) / 100)
}

export { latest }
