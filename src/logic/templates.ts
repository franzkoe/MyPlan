// Vorlagen für Pläne und einzelne Wochen sowie Plausibilitätsprüfungen.
import { diffDays, startOfWeek } from './dates'
import { maxBuildStreak, startForRace, taperWeeks } from './generator'
import type { Focus, GymSplit, Level, PlanConfig, Sport, Terrain } from './types'

export const SPORT_NAME: Record<Sport, string> = { run: 'Laufen', bike: 'Radfahren', swim: 'Schwimmen', tri: 'Triathlon', gym: 'Kraft' }
export const LEVEL_NAME = ['Einsteiger', 'Fortgeschritten', 'Ambitioniert']

export interface GoalDef {
  id: string
  name: string
  /** je Niveau: [Wochen, Einheiten pro Woche, Startumfang, Steigerung in %] */
  levels: [number, number, number, number][]
  basis: string[]
  split?: GymSplit[]
  /** Mindestwochen für einen sinnvollen Aufbau */
  minWeeks: number
  note: string
}

export const GOALS: Record<Sport, GoalDef[]> = {
  run: [
    { id: '5k', name: '5 km', levels: [[8, 3, 15, 6], [10, 4, 28, 5], [12, 5, 45, 4]], basis: ['verteilung', 'laufen', 'entlastung'], minWeeks: 6, note: 'Schwerpunkt auf Intervallen im 3- bis 5-km-Tempo, dazu Schwellenläufe' },
    { id: '10k', name: '10 km', levels: [[10, 3, 18, 6], [12, 4, 32, 5], [12, 5, 50, 4]], basis: ['verteilung', 'laufen', 'entlastung'], minWeeks: 6, note: 'Schwellenläufe und Intervalle im Wechsel, zum Schluss Wettkampftempo' },
    { id: 'half', name: 'Halbmarathon', levels: [[12, 3, 22, 6], [12, 4, 36, 5], [14, 5, 55, 4]], basis: ['verteilung', 'laufen', 'entlastung', 'tapering'], minWeeks: 8, note: 'Schwelle als Kern, lange Läufe bis gut 20 km, zum Schluss Halbmarathontempo' },
    { id: 'marathon', name: 'Marathon', levels: [[16, 4, 32, 6], [18, 5, 48, 5], [18, 6, 65, 4]], basis: ['verteilung', 'laufen', 'entlastung', 'tapering'], minWeeks: 12, note: 'Lange Läufe bis 30 bis 35 km, Abschnitte im Marathontempo, drei Wochen Tapering' },
    { id: 'ultra50', name: 'Ultra 50 km', levels: [[16, 4, 38, 6], [20, 5, 52, 5], [20, 6, 68, 4]], basis: ['verteilung', 'laufen', 'ultra', 'entlastung', 'tapering'], minWeeks: 12, note: 'Intensität früh im Plan, zum Wettkampf hin lange Einheiten nach Zeit' },
    { id: 'ultra100', name: 'Ultra 100 km', levels: [[20, 5, 48, 5], [24, 5, 60, 4.5], [24, 6, 78, 4]], basis: ['verteilung', 'laufen', 'ultra', 'entlastung', 'tapering'], minWeeks: 16, note: 'Wie 50 km, mit längeren Einheiten nach Zeit und Verpflegungstraining' },
    { id: 'ultra', name: 'Ultra, eigene Distanz', levels: [[16, 4, 40, 6], [20, 5, 55, 5], [24, 6, 72, 4]], basis: ['verteilung', 'laufen', 'ultra', 'entlastung', 'tapering'], minWeeks: 12, note: 'Distanz frei wählbar' },
    { id: 'fitness', name: 'Allgemeine Fitness', levels: [[8, 3, 12, 6], [8, 4, 25, 5], [8, 5, 40, 4]], basis: ['verteilung', 'laufen', 'entlastung'], minWeeks: 4, note: 'Überwiegend locker, eine zügige Einheit pro Woche' },
  ],
  bike: [
    { id: '50k', name: '50 km', levels: [[8, 2, 3, 6], [8, 3, 5, 5], [10, 4, 7, 4]], basis: ['verteilung', 'rad', 'entlastung'], minWeeks: 4, note: 'Grundlage und Sweet Spot' },
    { id: '100k', name: '100 km', levels: [[10, 3, 4, 6], [12, 3, 6, 5], [12, 4, 8, 4]], basis: ['verteilung', 'rad', 'entlastung'], minWeeks: 6, note: 'Lange Ausfahrten bis gut vier Stunden, Sweet Spot und Schwelle' },
    { id: '200k', name: '200 km', levels: [[14, 3, 6, 6], [16, 4, 8, 5], [16, 5, 10, 4]], basis: ['verteilung', 'rad', 'entlastung', 'tapering'], minWeeks: 10, note: 'Sehr lange Ausfahrten, Verpflegung üben' },
    { id: 'multi', name: 'Mehrtagestour', levels: [[12, 3, 5, 6], [14, 4, 7, 5], [16, 5, 9, 4]], basis: ['verteilung', 'rad', 'entlastung'], minWeeks: 8, note: 'Lange Fahrten an aufeinanderfolgenden Tagen vertragen lernen' },
    { id: 'fitness', name: 'Allgemeine Fitness', levels: [[8, 2, 3, 5], [8, 3, 5, 5], [8, 4, 7, 4]], basis: ['verteilung', 'rad', 'entlastung'], minWeeks: 4, note: 'Grundlage mit einer zügigen Einheit pro Woche' },
  ],
  swim: [
    { id: 'technique', name: 'Technik und Grundlage', levels: [[8, 2, 2.5, 5], [8, 3, 5, 5], [8, 3, 7.5, 4]], basis: ['schwimmen', 'entlastung'], minWeeks: 4, note: 'Viele Technikübungen, ruhige Wiederholungen' },
    { id: '400', name: '400 m', levels: [[8, 2, 3, 5], [8, 3, 6, 5], [10, 4, 10, 4]], basis: ['schwimmen', 'entlastung'], minWeeks: 6, note: 'CSS-Sätze und kurze schnelle Wiederholungen' },
    { id: '1500', name: '1500 m', levels: [[10, 2, 4, 5], [10, 3, 7, 5], [12, 4, 12, 4]], basis: ['schwimmen', 'entlastung'], minWeeks: 6, note: 'CSS-Sätze mit kurzer Pause, längere Grundlagensätze' },
    { id: '3800', name: '3,8 km', levels: [[12, 3, 6, 5], [14, 3, 9, 5], [16, 4, 13, 4]], basis: ['schwimmen', 'entlastung'], minWeeks: 8, note: 'Lange gleichmäßige Sätze, dazu Schwelle' },
    { id: 'open', name: 'Freiwasser', levels: [[10, 2, 4, 5], [10, 3, 7, 5], [12, 4, 11, 4]], basis: ['schwimmen', 'entlastung'], minWeeks: 6, note: 'Durchgehendes Schwimmen, Orientierung, Tempowechsel' },
  ],
  tri: [
    { id: 'sprint', name: 'Sprintdistanz', levels: [[10, 4, 4, 5], [12, 5, 6, 5], [12, 6, 8, 4]], basis: ['verteilung', 'triathlon', 'entlastung', 'tapering'], minWeeks: 8, note: '750 m, 20 km, 5 km' },
    { id: 'olympic', name: 'Olympische Distanz', levels: [[12, 5, 5, 5], [14, 6, 7, 5], [16, 7, 9, 4]], basis: ['verteilung', 'triathlon', 'entlastung', 'tapering'], minWeeks: 8, note: '1,5 km, 40 km, 10 km' },
    { id: 'half', name: 'Mitteldistanz (70.3)', levels: [[16, 5, 6, 5], [18, 6, 8, 5], [20, 7, 10, 4]], basis: ['verteilung', 'triathlon', 'entlastung', 'tapering'], minWeeks: 12, note: '1,9 km, 90 km, 21,1 km' },
    { id: 'full', name: 'Langdistanz', levels: [[20, 6, 8, 5], [24, 7, 10, 4.5], [24, 8, 12, 4]], basis: ['verteilung', 'triathlon', 'entlastung', 'tapering'], minWeeks: 16, note: '3,8 km, 180 km, 42,2 km' },
  ],
  gym: [
    { id: 'maxStrength', name: 'Maximalkraft', levels: [[8, 3, 36, 4], [10, 3, 45, 3], [12, 4, 60, 3]], basis: ['kraft', 'entlastung'], minWeeks: 4, note: 'Schwere Grundübungen, 3 bis 5 Wiederholungen, lange Pausen' },
    { id: 'hypertrophy', name: 'Muskelaufbau', levels: [[8, 3, 40, 5], [10, 4, 60, 4], [12, 4, 72, 3]], basis: ['kraft', 'entlastung'], minWeeks: 4, note: '6 bis 15 Wiederholungen, 10 oder mehr Sätze pro Muskelgruppe und Woche' },
    { id: 'strengthEndurance', name: 'Kraftausdauer', levels: [[8, 2, 28, 5], [8, 3, 42, 4], [10, 3, 50, 4]], basis: ['kraft', 'entlastung'], minWeeks: 4, note: 'Leichte Last, 15 bis 20 Wiederholungen, kurze Pausen' },
    { id: 'endurance', name: 'Ergänzend für Ausdauersportler', levels: [[12, 2, 20, 2], [12, 2, 24, 2], [12, 2, 28, 2]], basis: ['kraft', 'interferenz', 'entlastung'], minWeeks: 4, note: 'Zweimal pro Woche wenige schwere Sätze für Beine und Rumpf' },
    { id: 'fitness', name: 'Allgemeine Fitness', levels: [[8, 2, 28, 4], [8, 3, 42, 4], [8, 3, 50, 3]], basis: ['kraft', 'entlastung'], minWeeks: 4, note: 'Wechsel aus schweren, mittleren und leichten Tagen' },
  ],
}

export const goalDef = (sport: Sport, goal: string) => GOALS[sport].find((g) => g.id === goal) ?? GOALS[sport][0]

export function defaultDays(n: number): number[] {
  const table: Record<number, number[]> = { 1: [2], 2: [2, 6], 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [1, 2, 3, 5, 6], 6: [0, 1, 2, 3, 5, 6] }
  return table[Math.min(6, Math.max(1, n))]
}

export interface TemplateOptions {
  startDate: string
  raceDate?: string
  terrain?: Terrain
  targetTimeSec?: number
  distanceKm?: number
  split?: GymSplit
  weekStart?: number
}

export function templateConfig(sport: Sport, goal: string, level: Level, o: TemplateOptions): PlanConfig {
  const g = goalDef(sport, goal)
  const [weeks, n, vol, ramp] = g.levels[level]
  const ws = o.weekStart ?? 0
  return {
    sport,
    goal: g.id,
    level,
    weeks,
    startDate: o.raceDate ? startForRace(o.raceDate, weeks, ws) : startOfWeek(o.startDate, ws),
    raceDate: o.raceDate,
    targetTimeSec: o.targetTimeSec,
    distanceKm: o.distanceKm,
    sessionsPerWeek: n,
    days: defaultDays(Math.min(n, 6)),
    startVolume: vol,
    rampPct: ramp,
    deloadEvery: 4,
    focus: 'mixed',
    terrain: o.terrain ?? 'flat',
    split: sport === 'gym' ? (o.split ?? (n >= 4 ? 'upperLower' : 'full')) : undefined,
  }
}

export const templateName = (sport: Sport, goal: string, level: Level) => `${SPORT_NAME[sport]} ${goalDef(sport, goal).name}, ${LEVEL_NAME[level]}`

export interface WeekTemplate {
  id: string
  sport: Sport
  name: string
  focus: Focus
  deload?: boolean
  sessions: number
  /** Umfang je Niveau */
  volume: [number, number, number]
  note: string
}

export const WEEK_TEMPLATES: WeekTemplate[] = [
  { id: 'run-base', sport: 'run', name: 'Grundlagenwoche Laufen, 4 Einheiten', focus: 'base', sessions: 4, volume: [22, 35, 50], note: 'Nur lockere Läufe und ein langer Lauf' },
  { id: 'run-iv', sport: 'run', name: 'Intervallwoche Laufen, 4 Einheiten', focus: 'intervals', sessions: 4, volume: [22, 35, 50], note: 'Eine Intervalleinheit, sonst locker' },
  { id: 'run-thr', sport: 'run', name: 'Schwellenwoche Laufen, 4 Einheiten', focus: 'threshold', sessions: 4, volume: [22, 35, 50], note: 'Ein Schwellenlauf, sonst locker' },
  { id: 'run-hill', sport: 'run', name: 'Bergwoche Laufen, 4 Einheiten', focus: 'hills', sessions: 4, volume: [22, 35, 50], note: 'Bergläufe und ein welliger langer Lauf' },
  { id: 'run-deload', sport: 'run', name: 'Entlastungswoche Laufen', focus: 'mixed', deload: true, sessions: 3, volume: [14, 22, 32], note: 'Rund ein Drittel weniger Umfang, eine kurze zügige Einheit' },
  { id: 'bike-base', sport: 'bike', name: 'Grundlagenwoche Rad, 3 Einheiten', focus: 'base', sessions: 3, volume: [4, 6, 8], note: 'Nur Grundlage und eine lange Ausfahrt' },
  { id: 'bike-ss', sport: 'bike', name: 'Sweet-Spot-Woche Rad, 3 Einheiten', focus: 'tempo', sessions: 3, volume: [4, 6, 8], note: 'Eine Sweet-Spot-Einheit, sonst Grundlage' },
  { id: 'bike-deload', sport: 'bike', name: 'Entlastungswoche Rad', focus: 'mixed', deload: true, sessions: 3, volume: [2.5, 4, 5.5], note: 'Kürzer und überwiegend locker' },
  { id: 'swim-tech', sport: 'swim', name: 'Technikwoche Schwimmen, 2 Einheiten', focus: 'base', sessions: 2, volume: [2.5, 4, 5.5], note: 'Technikübungen und ruhige Sätze' },
  { id: 'swim-deload', sport: 'swim', name: 'Entlastungswoche Schwimmen', focus: 'mixed', deload: true, sessions: 2, volume: [2, 3, 4], note: 'Weniger Meter, ein kurzer CSS-Satz' },
  { id: 'tri-base', sport: 'tri', name: 'Grundlagenwoche Triathlon, 5 Einheiten', focus: 'base', sessions: 5, volume: [5, 7, 9], note: 'Alle drei Disziplinen locker, eine kurze Koppeleinheit' },
  { id: 'tri-deload', sport: 'tri', name: 'Entlastungswoche Triathlon', focus: 'mixed', deload: true, sessions: 4, volume: [3.5, 5, 6.5], note: 'Weniger Stunden, eine zügige Einheit' },
  { id: 'gym-full', sport: 'gym', name: 'Ganzkörperwoche Kraft, 2 Einheiten', focus: 'hypertrophy', sessions: 2, volume: [24, 30, 36], note: 'Zwei Ganzkörpereinheiten' },
  { id: 'gym-stab', sport: 'gym', name: 'Stabilität und Mobilität, 2 Einheiten', focus: 'stability', sessions: 2, volume: [20, 24, 28], note: 'Rumpf, einbeinige Übungen, Beweglichkeit' },
  { id: 'gym-deload', sport: 'gym', name: 'Deload-Woche Kraft', focus: 'mixed', deload: true, sessions: 2, volume: [16, 20, 24], note: 'Weniger Sätze und etwa 10 % weniger Last' },
]

export function weekTemplateConfig(t: WeekTemplate, level: Level, weekStartDate: string): PlanConfig {
  return {
    sport: t.sport,
    goal: t.sport === 'gym' ? 'fitness' : t.sport === 'tri' ? 'olympic' : t.sport === 'swim' ? 'technique' : 'fitness',
    level,
    weeks: 1,
    startDate: weekStartDate,
    sessionsPerWeek: t.sessions,
    days: defaultDays(Math.min(6, t.sessions)),
    // Der Generator rechnet bei Entlastung vom Aufbauwert herunter
    startVolume: t.deload ? t.volume[level] / 0.65 : t.volume[level],
    rampPct: 0,
    deloadEvery: 4,
    focus: t.focus,
    terrain: 'flat',
    split: t.sport === 'gym' ? 'full' : undefined,
    single: true,
    weekOverrides: t.deload ? { 0: { deload: true } } : undefined,
  }
}

// ---------- Plausibilität ----------

export interface Issue {
  level: 'error' | 'warn' | 'info'
  text: string
  fix?: { label: string; patch: Partial<PlanConfig> }
}

export const DELOAD_WHY =
  'Entlastungswochen lassen sich verschieben, aber nicht abschalten. Der Körper passt sich in der Erholung an, nicht in der Belastung. Ohne regelmäßige Entlastung steigt die Ermüdung schneller als die Fitness.'

export const RAMP_WARNING =
  'Eine Steigerung von mehr als etwa 10 % pro Woche gilt als Faustregel für erhöhtes Verletzungsrisiko. Die Studienlage dazu ist uneinheitlich: Entscheidend scheinen vor allem plötzliche Sprünge und die Länge einzelner Einheiten zu sein. Du kannst den Wert trotzdem verwenden.'

export function validateConfig(cfg: PlanConfig, todayIso: string): Issue[] {
  const out: Issue[] = []
  const g = goalDef(cfg.sport, cfg.goal)
  if (cfg.single) return out
  if (cfg.raceDate) {
    const days = diffDays(cfg.raceDate, todayIso)
    const weeksLeft = Math.floor(days / 7)
    if (days < 0) out.push({ level: 'error', text: 'Das Zieldatum liegt in der Vergangenheit' })
    else if (weeksLeft < g.minWeeks)
      out.push({
        level: 'error',
        text: `Bis zum Zieldatum sind es ${weeksLeft} Wochen. Für ${g.name} braucht ein Aufbau mindestens ${g.minWeeks} Wochen. Wähle ein späteres Datum oder ein kürzeres Ziel`,
      })
    else if (cfg.startDate < startOfWeek(todayIso) && cfg.weeks > weeksLeft + 1)
      out.push({ level: 'warn', text: `Der Plan hat ${cfg.weeks} Wochen, bis zum Ziel sind es ${weeksLeft + 1}. Die ersten Wochen lägen in der Vergangenheit`, fix: { label: `Auf ${weeksLeft + 1} Wochen kürzen`, patch: { weeks: weeksLeft + 1 } } })
  }
  if (cfg.weeks < 1) out.push({ level: 'error', text: 'Der Plan braucht mindestens eine Woche' })
  if (cfg.weeks > 52) out.push({ level: 'error', text: 'Mehr als 52 Wochen lassen sich nicht sinnvoll vorausplanen. Lege lieber einen Folgeplan an', fix: { label: 'Auf 52 Wochen setzen', patch: { weeks: 52 } } })
  if (cfg.days.length === 0) out.push({ level: 'error', text: 'Wähle mindestens einen Trainingstag' })
  const maxPerWeek = cfg.sport === 'tri' ? 9 : 6
  if (cfg.sessionsPerWeek > maxPerWeek)
    out.push({ level: 'error', text: `${cfg.sessionsPerWeek} Einheiten pro Woche lassen keinen Ruhetag. Mindestens ein freier Tag pro Woche ist fest eingeplant`, fix: { label: `Auf ${maxPerWeek} Einheiten setzen`, patch: { sessionsPerWeek: maxPerWeek } } })
  if (cfg.days.length >= 7 && cfg.sport !== 'tri')
    out.push({ level: 'error', text: 'Sieben Trainingstage lassen keinen Ruhetag. Nimm einen Tag heraus', fix: { label: 'Montag freihalten', patch: { days: cfg.days.filter((d) => d !== 0) } } })
  if (cfg.sport !== 'tri' && cfg.days.length > 0 && cfg.sessionsPerWeek > cfg.days.length)
    out.push({
      level: 'error',
      text: `${cfg.sessionsPerWeek} Einheiten passen nicht auf ${cfg.days.length} Trainingstage`,
      fix: { label: `Auf ${cfg.days.length} Einheiten setzen`, patch: { sessionsPerWeek: cfg.days.length } },
    })
  if (cfg.sport === 'tri' && cfg.days.length > 0 && cfg.sessionsPerWeek > cfg.days.length * 2)
    out.push({ level: 'error', text: 'Mehr als zwei Einheiten pro Tag sind nicht vorgesehen', fix: { label: 'Einheiten verringern', patch: { sessionsPerWeek: cfg.days.length * 2 } } })
  if (cfg.rampPct > 10) out.push({ level: 'warn', text: RAMP_WARNING })
  if (cfg.rampPct < 0) out.push({ level: 'error', text: 'Die Steigerung kann nicht negativ sein', fix: { label: 'Auf 0 % setzen', patch: { rampPct: 0 } } })
  const limits: Record<Sport, [number, number, string]> = { run: [5, 200, 'km'], bike: [1, 30, 'Stunden'], swim: [1, 40, 'km'], tri: [3, 30, 'Stunden'], gym: [6, 150, 'Sätze'] }
  const [lo, hi, unit] = limits[cfg.sport]
  if (cfg.startVolume < lo) out.push({ level: 'error', text: `Der Startumfang ist zu klein für sinnvolle Einheiten. Mindestens ${lo} ${unit} pro Woche`, fix: { label: `Auf ${lo} ${unit} setzen`, patch: { startVolume: lo } } })
  if (cfg.startVolume > hi) out.push({ level: 'error', text: `Ein Startumfang von mehr als ${hi} ${unit} pro Woche ist unplausibel. Bitte prüfen` })
  if (maxBuildStreak(cfg) > 4) out.push({ level: 'error', text: `Mehr als vier Aufbauwochen am Stück sind nicht möglich. ${DELOAD_WHY}` })
  if (cfg.raceDate && taperWeeks(cfg) === 0 && cfg.weeks < 4) out.push({ level: 'info', text: 'Der Plan ist zu kurz für eine eigene Tapering-Phase. Die letzte Woche vor dem Ziel fällt trotzdem kürzer aus' })
  return out
}

/** Prüft einen Profilwert. Gibt eine Meldung zurück, wenn er unplausibel ist. */
export function checkValue(field: string, v: number | undefined, ctx: { hrMax?: number; hrRest?: number } = {}): string | undefined {
  if (v === undefined || !isFinite(v)) return undefined
  const range = (lo: number, hi: number, what: string, hint: string) => (v < lo || v > hi ? `${what} ${v} ist unplausibel. Üblich sind ${lo} bis ${hi}${hint ? '. ' + hint : ''}` : undefined)
  switch (field) {
    case 'hrMax':
      return range(120, 225, 'Ein Maximalpuls von', 'Lass das Feld leer, dann schätzt die App ihn aus dem Alter')
    case 'hrRest':
      return range(28, 100, 'Ein Ruhepuls von', '') ?? (ctx.hrMax && v >= ctx.hrMax - 40 ? 'Der Ruhepuls liegt zu nah am Maximalpuls' : undefined)
    case 'lthr':
      return range(100, 210, 'Ein Schwellenpuls von', '') ?? (ctx.hrMax && v >= ctx.hrMax ? 'Der Schwellenpuls muss unter dem Maximalpuls liegen' : ctx.hrRest && v <= ctx.hrRest + 20 ? 'Der Schwellenpuls liegt zu nah am Ruhepuls' : undefined)
    case 'ftp':
      return range(60, 500, 'Eine FTP von', 'Angabe in Watt')
    case 'vo2max':
      return range(20, 90, 'Eine VO2max von', 'Angabe in ml/kg/min')
    case 'weight':
      return range(35, 200, 'Ein Gewicht von', 'Angabe in kg')
    case 'height':
      return range(130, 220, 'Eine Größe von', 'Angabe in cm')
    case 'birthYear': {
      const y = new Date().getFullYear()
      return v < y - 95 || v > y - 12 ? 'Bitte das Geburtsjahr vierstellig eingeben' : undefined
    }
    case 'thresholdPace':
      return v < 150 || v > 540 ? 'Ein Schwellentempo liegt üblicherweise zwischen 2:30 und 9:00 min/km' : undefined
    case 'css':
      return v < 60 || v > 240 ? 'Ein CSS-Tempo liegt üblicherweise zwischen 1:00 und 4:00 min/100 m' : undefined
    case 'hrv':
      return range(5, 250, 'Eine HRV von', 'Angabe als RMSSD in ms')
    case 'sleep':
      return range(2, 14, 'Eine Schlafdauer von', 'Angabe in Stunden')
  }
  return undefined
}
