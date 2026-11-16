// Analyse: Werde ich besser? Ehrliche Aussagen: zu wenig Daten wird als solches benannt,
// verglichen werden nur vergleichbare Einheiten.
import { addDays, diffDays, fmtTime, startOfWeek } from './dates'
import { BASE_LIFTS, exerciseById } from './exercises'
import { formCurve, type FormPoint } from './load'
import { latest, type Activity, type Profile, type Session, type Sport } from './types'
import { epley, fmtPace, predictRace, runFitness } from './zones'

export type Trend = 'better' | 'same' | 'worse' | 'nodata'

export interface Finding {
  id: string
  title: string
  trend: Trend
  /** die Aussage in einem Satz */
  sentence: string
  /** die Zahl dahinter */
  value?: string
  /** Einheiten, aus denen die Kennzahl entstanden ist */
  activityIds: string[]
  series?: { date: string; value: number }[]
  unit?: string
  /** kleinere Werte sind besser (Tempo, Drift) */
  lowerIsBetter?: boolean
  chartNote?: string
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

interface Windows<T> {
  recent: T[]
  earlier: T[]
}

/** Jüngste drei Wochen gegen den Zeitraum vier bis zehn Wochen davor */
function windows<T extends { date: string }>(list: T[], today: string, recentDays = 21, gapDays = 28, earlierDays = 42): Windows<T> {
  return {
    recent: list.filter((x) => diffDays(today, x.date) >= 0 && diffDays(today, x.date) < recentDays),
    earlier: list.filter((x) => diffDays(today, x.date) >= gapDays && diffDays(today, x.date) < gapDays + earlierDays),
  }
}

const NEED = 'Zu wenig Daten für eine Aussage'

/** Tempo bei gleicher Herzfrequenz in lockeren Läufen */
export function paceAtSameHr(acts: Activity[], today: string, mi = false): Finding {
  const runs = acts.filter((a) => a.discipline === 'run' && a.avgHr && a.distanceM && a.distanceM >= 3000 && a.durationSec >= 1200)
  const base: Finding = { id: 'run-pace-hr', title: 'Tempo bei gleichem Puls', trend: 'nodata', sentence: NEED, activityIds: [], unit: mi ? 'min/mi' : 'min/km', lowerIsBetter: true }
  const easy = runs.filter((a) => {
    if (!a.hrZoneSec) return true
    const total = a.hrZoneSec.reduce((x, y) => x + y, 0)
    return total > 0 && (a.hrZoneSec[0] + a.hrZoneSec[1] + a.hrZoneSec[2] * 0.5) / total >= 0.7
  })
  if (easy.length < 4) return { ...base, sentence: `${NEED}: Es braucht mindestens vier lockere Läufe mit Pulsmessung, bisher sind es ${easy.length}` }
  const lowHalf = [...easy].sort((a, b) => a.avgHr! - b.avgHr!).slice(0, Math.max(4, Math.ceil(easy.length * 0.7)))
  const ref = median(lowHalf.map((a) => a.avgHr!))
  const comparable = easy.filter((a) => Math.abs(a.avgHr! - ref) <= 6).map((a) => ({ id: a.id, date: a.date, pace: a.durationSec / (a.distanceM! / 1000) }))
  const w = windows(comparable, today)
  const series = comparable.sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({ date: c.date, value: c.pace }))
  if (w.recent.length < 2 || w.earlier.length < 2)
    return { ...base, series, activityIds: comparable.map((c) => c.id), sentence: `${NEED}: Für den Vergleich braucht es je zwei Läufe bei Puls ${Math.round(ref - 6)} bis ${Math.round(ref + 6)} in den letzten drei Wochen und im Zeitraum davor` }
  const now = mean(w.recent.map((c) => c.pace))
  const then = mean(w.earlier.map((c) => c.pace))
  const diff = Math.round(then - now)
  const trend: Trend = Math.abs(diff) < 3 ? 'same' : diff > 0 ? 'better' : 'worse'
  const sentence =
    trend === 'same'
      ? `Tempo bei gleichem Puls unverändert gegenüber vor 6 Wochen`
      : `Tempo bei gleichem Puls: ${Math.abs(diff)} s/km ${diff > 0 ? 'schneller' : 'langsamer'} als vor 6 Wochen`
  return {
    ...base,
    trend,
    sentence,
    value: `${fmtPace(now, mi)} ${base.unit} bei Puls ${Math.round(ref)}`,
    activityIds: [...w.recent, ...w.earlier].map((c) => c.id),
    series,
    chartNote: `Jeder Punkt ist ein lockerer Lauf bei Puls ${Math.round(ref - 6)} bis ${Math.round(ref + 6)}. Tiefer ist schneller`,
  }
}

/** Herzfrequenz-Drift in langen Einheiten */
export function driftTrend(acts: Activity[], discipline: 'run' | 'bike'): Finding {
  const long = acts.filter((a) => a.discipline === discipline && a.driftPct !== undefined && a.durationSec >= 4500).sort((a, b) => a.date.localeCompare(b.date))
  const base: Finding = { id: `${discipline}-drift`, title: 'Pulsdrift in langen Einheiten', trend: 'nodata', sentence: NEED, activityIds: long.map((a) => a.id), unit: '%', lowerIsBetter: true, series: long.map((a) => ({ date: a.date, value: a.driftPct! })) }
  if (long.length < 3) return { ...base, sentence: `${NEED}: Es braucht drei lange Einheiten ab 75 min mit Pulsmessung, bisher ${long.length}` }
  const last = long.slice(-2)
  const before = long.slice(0, -2).slice(-3)
  const now = mean(last.map((a) => a.driftPct!))
  const then = mean(before.map((a) => a.driftPct!))
  const diff = then - now
  const trend: Trend = Math.abs(diff) < 1 ? 'same' : diff > 0 ? 'better' : 'worse'
  const quality = now < 5 ? 'Unter 5 % gilt als stabile Grundlage' : 'Über 5 % deutet auf zu hohes Tempo oder noch fehlende Grundlage'
  return {
    ...base,
    trend,
    sentence: trend === 'same' ? `Pulsdrift in langen Einheiten unverändert bei ${now.toFixed(1).replace('.', ',')} %` : `Pulsdrift in langen Einheiten ${diff > 0 ? 'gesunken' : 'gestiegen'}: ${now.toFixed(1).replace('.', ',')} % statt ${then.toFixed(1).replace('.', ',')} %`,
    value: `${now.toFixed(1).replace('.', ',')} %. ${quality}`,
    chartNote: 'Drift: um wie viel das Verhältnis von Tempo zu Puls in der zweiten Hälfte abfällt. Tiefer ist besser',
  }
}

export interface BestRow {
  key: number
  label: string
  value: number
  date: string
  activityId: string
  recent: boolean
}

export const DIST_LABEL: Record<number, string> = { 1000: '1 km', 5000: '5 km', 10000: '10 km', 21097.5: 'Halbmarathon', 42195: 'Marathon' }
export const WINDOW_LABEL: Record<number, string> = { 300: '5 min', 1200: '20 min', 3600: '60 min' }

export function runBests(acts: Activity[], today: string): BestRow[] {
  const out: BestRow[] = []
  for (const key of Object.keys(DIST_LABEL).map(Number).sort((a, b) => a - b)) {
    let best: BestRow | undefined
    for (const a of acts) {
      const b = a.bestEfforts?.find((x) => x.key === key)
      if (b && (!best || b.value < best.value)) best = { key, label: DIST_LABEL[key], value: b.value, date: a.date, activityId: a.id, recent: diffDays(today, a.date) <= 42 }
    }
    if (best) out.push(best)
  }
  return out
}

export function powerBests(acts: Activity[], today: string, days = 42, offset = 0): BestRow[] {
  const out: BestRow[] = []
  const inRange = acts.filter((a) => diffDays(today, a.date) >= offset && diffDays(today, a.date) < offset + days)
  for (const key of [300, 1200, 3600]) {
    let best: BestRow | undefined
    for (const a of inRange) {
      const b = a.powerBests?.find((x) => x.key === key)
      if (b && (!best || b.value > best.value)) best = { key, label: WINDOW_LABEL[key], value: b.value, date: a.date, activityId: a.id, recent: true }
    }
    if (best) out.push(best)
  }
  return out
}

export function racePrediction(p: Profile, today: string): { rows: { label: string; time: string }[]; basis: string; estimate: boolean } | undefined {
  const fit = runFitness(p, today)
  if (!fit) return undefined
  return {
    rows: [
      [5000, '5 km'],
      [10000, '10 km'],
      [21097.5, 'Halbmarathon'],
      [42195, 'Marathon'],
    ].map(([d, label]) => ({ label: label as string, time: fmtTime(predictRace(fit.vdot, d as number)) })),
    basis: fit.detail,
    estimate: fit.estimate,
  }
}

/** Rad: Leistung bei gleicher Herzfrequenz */
export function powerAtSameHr(acts: Activity[], today: string): Finding {
  const rides = acts.filter((a) => a.discipline === 'bike' && a.avgHr && a.np && a.durationSec >= 1800)
  const base: Finding = { id: 'bike-power-hr', title: 'Leistung bei gleichem Puls', trend: 'nodata', sentence: NEED, activityIds: [], unit: 'W' }
  if (rides.length < 4) return { ...base, sentence: `${NEED}: Es braucht mindestens vier Fahrten mit Leistungs- und Pulsmessung, bisher ${rides.length}` }
  const ref = median(rides.map((a) => a.avgHr!))
  const comp = rides.filter((a) => Math.abs(a.avgHr! - ref) <= 7).map((a) => ({ id: a.id, date: a.date, w: a.np! }))
  const w = windows(comp, today)
  const series = comp.sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({ date: c.date, value: c.w }))
  if (w.recent.length < 2 || w.earlier.length < 2) return { ...base, series, activityIds: comp.map((c) => c.id), sentence: `${NEED}: Für den Vergleich braucht es je zwei Fahrten bei Puls ${Math.round(ref - 7)} bis ${Math.round(ref + 7)} in den letzten drei Wochen und davor` }
  const now = mean(w.recent.map((c) => c.w))
  const then = mean(w.earlier.map((c) => c.w))
  const diff = Math.round(now - then)
  const trend: Trend = Math.abs(diff) < Math.max(3, then * 0.015) ? 'same' : diff > 0 ? 'better' : 'worse'
  return {
    ...base,
    trend,
    sentence: trend === 'same' ? 'Leistung bei gleichem Puls unverändert gegenüber vor 6 Wochen' : `Leistung bei gleichem Puls: ${Math.abs(diff)} W ${diff > 0 ? 'mehr' : 'weniger'} als vor 6 Wochen`,
    value: `${Math.round(now)} W bei Puls ${Math.round(ref)}`,
    activityIds: [...w.recent, ...w.earlier].map((c) => c.id),
    series,
    chartNote: `Jeder Punkt ist eine Fahrt bei Puls ${Math.round(ref - 7)} bis ${Math.round(ref + 7)}. Höher ist besser`,
  }
}

export function ftpEstimate(acts: Activity[], today: string): { value: number; activityId: string; date: string } | undefined {
  const b = powerBests(acts, today, 56).find((x) => x.key === 1200)
  return b ? { value: Math.round(b.value * 0.95), activityId: b.activityId, date: b.date } : undefined
}

/** Schwimmen: Tempo pro 100 m */
export function swimPace(acts: Activity[], today: string): Finding {
  const swims = acts.filter((a) => a.discipline === 'swim' && a.distanceM && a.distanceM >= 400).map((a) => ({ id: a.id, date: a.date, pace: a.durationSec / (a.distanceM! / 100) }))
  const series = [...swims].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, value: s.pace }))
  const base: Finding = { id: 'swim-pace', title: 'Tempo pro 100 m', trend: 'nodata', sentence: NEED, activityIds: swims.map((s) => s.id), unit: 'min/100 m', lowerIsBetter: true, series }
  const w = windows(swims, today)
  if (w.recent.length < 2 || w.earlier.length < 2) return { ...base, sentence: `${NEED}: Es braucht je zwei Schwimmeinheiten in den letzten drei Wochen und im Zeitraum davor` }
  const now = mean(w.recent.map((s) => s.pace))
  const then = mean(w.earlier.map((s) => s.pace))
  const diff = Math.round(then - now)
  const trend: Trend = Math.abs(diff) < 2 ? 'same' : diff > 0 ? 'better' : 'worse'
  return {
    ...base,
    trend,
    sentence: trend === 'same' ? 'Durchschnittstempo im Wasser unverändert gegenüber vor 6 Wochen' : `Durchschnittstempo im Wasser: ${Math.abs(diff)} s pro 100 m ${diff > 0 ? 'schneller' : 'langsamer'} als vor 6 Wochen`,
    value: `${fmtTime(now)} min/100 m, Pausen eingerechnet`,
    chartNote: 'Durchschnitt der ganzen Einheit einschließlich Pausen. Aussagekräftiger ist der CSS-Test',
  }
}

/** Verlauf eines Profilwerts (FTP, CSS, VO2max) */
export function valueTrend(id: string, title: string, list: { date: string; value: number }[], unit: string, lowerIsBetter: boolean, fmt: (v: number) => string, minChange: number): Finding {
  const s = [...list].sort((a, b) => a.date.localeCompare(b.date))
  const base: Finding = { id, title, trend: 'nodata', sentence: NEED, activityIds: [], unit, lowerIsBetter, series: s }
  if (s.length === 0) return { ...base, sentence: `Noch kein Wert für ${title} eingetragen` }
  if (s.length === 1) return { ...base, value: fmt(s[0].value), sentence: `${title}: erst ein Wert, noch kein Verlauf` }
  const a = s[s.length - 2]
  const b = s[s.length - 1]
  const diff = b.value - a.value
  const good = lowerIsBetter ? diff < 0 : diff > 0
  const trend: Trend = Math.abs(diff) < minChange ? 'same' : good ? 'better' : 'worse'
  const weeks = Math.max(1, Math.round(diffDays(b.date, a.date) / 7))
  return {
    ...base,
    trend,
    value: fmt(b.value),
    sentence: trend === 'same' ? `${title} unverändert seit ${weeks} Wochen` : `${title}: von ${fmt(a.value)} auf ${fmt(b.value)} in ${weeks} Wochen`,
  }
}

/** Kraft: geschätztes 1RM je Grundübung aus den eingetragenen Sätzen */
export function strengthFindings(acts: Activity[], today: string, custom: { id: string; name: string; muscles: string[]; pattern: string }[] = []): Finding[] {
  const out: Finding[] = []
  const gym = acts.filter((a) => a.sets?.length)
  for (const id of BASE_LIFTS) {
    const pts = gym
      .map((a) => {
        const sets = a.sets!.filter((s) => s.exerciseId === id && s.reps >= 1 && s.reps <= 12 && s.kg > 0)
        return sets.length ? { id: a.id, date: a.date, value: Math.max(...sets.map((s) => epley(s.kg, s.reps))) } : undefined
      })
      .filter((x): x is { id: string; date: string; value: number } => !!x)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!pts.length) continue
    const name = exerciseById(id, custom)?.name ?? id
    const base: Finding = { id: `gym-${id}`, title: `${name}: geschätztes 1RM`, trend: 'nodata', sentence: NEED, activityIds: pts.map((p) => p.id), unit: 'kg', series: pts.map((p) => ({ date: p.date, value: Math.round(p.value * 10) / 10 })) }
    const w = windows(pts, today)
    if (w.recent.length < 1 || w.earlier.length < 1) {
      out.push({ ...base, value: `${Math.round(pts[pts.length - 1].value)} kg`, sentence: `${name}: ${NEED.toLowerCase()}. Es braucht Einheiten aus den letzten drei Wochen und aus dem Zeitraum davor` })
      continue
    }
    const now = Math.max(...w.recent.map((p) => p.value))
    const then = Math.max(...w.earlier.map((p) => p.value))
    const diff = now - then
    const trend: Trend = Math.abs(diff) < Math.max(1.25, then * 0.015) ? 'same' : diff > 0 ? 'better' : 'worse'
    out.push({
      ...base,
      trend,
      value: `${Math.round(now)} kg (Schätzung nach Epley)`,
      sentence: trend === 'same' ? `${name}: geschätztes 1RM unverändert bei ${Math.round(now)} kg` : `${name}: geschätztes 1RM ${diff > 0 ? 'gestiegen' : 'gesunken'} von ${Math.round(then)} auf ${Math.round(now)} kg`,
      chartNote: 'Bester Satz je Einheit, hochgerechnet auf eine Wiederholung. Nur Sätze bis 12 Wiederholungen',
    })
  }
  return out
}

/** Sätze pro Muskelgruppe in einer Woche */
export function weeklySetsByMuscle(acts: Activity[], weekStartIso: string, custom: { id: string; name: string; muscles: string[]; pattern: string }[] = []): { muscle: string; sets: number }[] {
  const map = new Map<string, number>()
  for (const a of acts) {
    if (!a.sets || a.date < weekStartIso || a.date > addDays(weekStartIso, 6)) continue
    for (const s of a.sets) for (const m of exerciseById(s.exerciseId, custom)?.muscles ?? []) map.set(m, (map.get(m) ?? 0) + 1)
  }
  return [...map.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets)
}

// ---------- Plan-Fortschritt ----------

export interface Compliance {
  due: number
  done: number
  skipped: number
  rate: number
}

export function compliance(sessions: Session[], today: string): Compliance {
  const due = sessions.filter((s) => s.date < today || s.status !== 'planned')
  const done = due.filter((s) => s.status === 'done').length
  return { due: due.length, done, skipped: due.filter((s) => s.status === 'skipped').length, rate: due.length ? done / due.length : 0 }
}

export interface ZoneShare {
  /** Anteil der Zeit je Zone 1–5 */
  share: number[]
  totalSec: number
  easyShare: number
  count: number
  sentence: string
}

/** Verteilung der Trainingszeit auf die Pulszonen im Vergleich zur Vorgabe (etwa 80 % locker) */
export function zoneDistribution(acts: Activity[], from: string, to: string): ZoneShare | undefined {
  const list = acts.filter((a) => a.date >= from && a.date <= to && a.hrZoneSec)
  if (!list.length) return undefined
  const sum = [0, 0, 0, 0, 0]
  for (const a of list) a.hrZoneSec!.forEach((s, i) => (sum[i] += s))
  const total = sum.reduce((a, b) => a + b, 0)
  if (total < 3600) return undefined
  const share = sum.map((s) => s / total)
  const easy = share[0] + share[1]
  const pct = Math.round(easy * 100)
  const sentence =
    easy >= 0.75
      ? `${pct} % der Zeit locker. Das entspricht der Vorgabe von etwa 80 %`
      : easy >= 0.65
        ? `${pct} % der Zeit locker, etwas weniger als die Vorgabe von etwa 80 %. Die lockeren Einheiten dürfen ruhiger sein`
        : `Nur ${pct} % der Zeit locker, Vorgabe sind etwa 80 %. Viel Zeit im mittleren Bereich ermüdet, ohne gezielt zu fordern`
  return { share, totalSec: total, easyShare: easy, count: list.length, sentence }
}

export function form(acts: Activity[], today: string): FormPoint[] {
  return formCurve(acts.map((a) => ({ date: a.date, load: a.load })), today)
}

export function formSentence(curve: FormPoint[]): { sentence: string; trend: Trend } {
  if (curve.length < 28) return { sentence: `${NEED}: Fitness und Form brauchen mindestens vier Wochen Aufzeichnungen, bisher ${Math.floor(curve.length / 7)}`, trend: 'nodata' }
  const now = curve[curve.length - 1]
  const then = curve[curve.length - 29]
  const diff = now.ctl - then.ctl
  const tsb = Math.round(now.tsb)
  const state = tsb < -25 ? 'Du bist deutlich ermüdet' : tsb < -10 ? 'Du trägst spürbare Ermüdung' : tsb <= 10 ? 'Belastung und Erholung sind im Gleichgewicht' : 'Du bist frisch'
  const trend: Trend = Math.abs(diff) < 2 ? 'same' : diff > 0 ? 'better' : 'worse'
  const fit = trend === 'same' ? 'Fitness unverändert gegenüber vor vier Wochen' : `Fitness in vier Wochen ${diff > 0 ? 'gestiegen' : 'gesunken'} (${Math.round(then.ctl)} auf ${Math.round(now.ctl)})`
  return { sentence: `${fit}. ${state}`, trend }
}

/** Ist-Umfang je Woche und Sportart aus den Aktivitäten */
export function weeklyActual(acts: Activity[], weekStartIso: string): { minutes: number; runKm: number; bikeH: number; swimKm: number; load: number; count: number } {
  const list = acts.filter((a) => a.date >= weekStartIso && a.date <= addDays(weekStartIso, 6))
  return {
    minutes: list.reduce((x, a) => x + a.durationSec / 60, 0),
    runKm: list.filter((a) => a.discipline === 'run').reduce((x, a) => x + (a.distanceM ?? 0) / 1000, 0),
    bikeH: list.filter((a) => a.discipline === 'bike').reduce((x, a) => x + a.durationSec / 3600, 0),
    swimKm: list.filter((a) => a.discipline === 'swim').reduce((x, a) => x + (a.distanceM ?? 0) / 1000, 0),
    load: list.reduce((x, a) => x + a.load, 0),
    count: list.length,
  }
}

/** Die wichtigste Aussage je Sportart für die Startseite */
export function headline(sport: Sport, acts: Activity[], p: Profile, today: string): Finding {
  if (sport === 'run') return paceAtSameHr(acts, today, p.units.distance === 'mi')
  if (sport === 'bike') {
    const f = powerAtSameHr(acts, today)
    if (f.trend !== 'nodata' || !p.ftp.length) return f
    return valueTrend('bike-ftp', 'FTP', p.ftp, 'W', false, (v) => `${Math.round(v)} W`, 3)
  }
  if (sport === 'swim') {
    const css = valueTrend('swim-css', 'CSS', p.css, 'min/100 m', true, (v) => `${fmtTime(v)} min/100 m`, 1)
    return css.trend !== 'nodata' ? css : swimPace(acts, today)
  }
  if (sport === 'gym') {
    const fs = strengthFindings(acts, today)
    const rated = fs.filter((f) => f.trend !== 'nodata')
    if (!rated.length) return fs[0] ?? { id: 'gym', title: 'Kraft', trend: 'nodata', sentence: `${NEED}: Trage Krafteinheiten mit Sätzen, Wiederholungen und Gewicht ein`, activityIds: [] }
    const better = rated.filter((f) => f.trend === 'better').length
    const worse = rated.filter((f) => f.trend === 'worse').length
    const trend: Trend = better > worse ? 'better' : worse > better ? 'worse' : 'same'
    return { ...rated[0], id: 'gym', title: 'Kraft', trend, sentence: `Geschätztes 1RM: ${better} von ${rated.length} Grundübungen gestiegen, ${worse} gesunken`, value: undefined }
  }
  // Triathlon: Belastungsverlauf über alle Disziplinen
  const fs = formSentence(form(acts, today))
  return { id: 'tri', title: 'Triathlon', trend: fs.trend, sentence: fs.sentence, activityIds: [] }
}

/** Vorschlag für einen neuen Leistungstest, wenn der letzte Wert älter als acht Wochen ist */
export function testsDue(p: Profile, today: string): { id: string; text: string; builder: string }[] {
  const out: { id: string; text: string; builder: string }[] = []
  const old = (d?: string) => !d || diffDays(today, d) > 56
  const week = startOfWeek(today)
  if (p.sports.includes('run') || p.sports.includes('tri')) {
    const d = [latest(p.thresholdPace)?.date, [...p.raceResults].sort((a, b) => a.date.localeCompare(b.date)).pop()?.date].filter(Boolean).sort().pop()
    if (old(d)) out.push({ id: `test-run-${week.slice(0, 7)}`, text: d ? 'Dein Lauf-Leistungsstand ist älter als acht Wochen. Ein 30-Minuten-Test oder ein Wettkampf bringt aktuelle Tempobereiche' : 'Für genaue Tempobereiche fehlt ein Lauf-Leistungsstand. Ein 30-Minuten-Test liefert Schwellentempo und Schwellenpuls', builder: 'run.test' })
  }
  if (p.sports.includes('bike') || p.sports.includes('tri')) {
    const d = latest(p.ftp)?.date
    if (p.ftp.length && old(d)) out.push({ id: `test-bike-${week.slice(0, 7)}`, text: 'Deine FTP ist älter als acht Wochen. Ein 20-Minuten-Test bringt aktuelle Leistungszonen', builder: 'bike.test' })
  }
  if (p.sports.includes('swim') || p.sports.includes('tri')) {
    const d = latest(p.css)?.date
    if (old(d)) out.push({ id: `test-swim-${week.slice(0, 7)}`, text: d ? 'Dein CSS-Wert ist älter als acht Wochen. Ein neuer 400-m- und 200-m-Test bringt aktuelle Schwimmtempi' : 'Für Schwimmtempi fehlt dein CSS-Wert. Der Test dauert 40 min', builder: 'swim.test' })
  }
  return out
}
