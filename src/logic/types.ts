// Datenmodell der App. Keine UI-Abhängigkeiten.

export type Sport = 'run' | 'bike' | 'swim' | 'tri' | 'gym'
export type Discipline = 'run' | 'bike' | 'swim' | 'gym' | 'mobility'
export type Kind =
  | 'easy' // Grundlage
  | 'long' // lange Einheit
  | 'recovery' // Regeneration
  | 'tempo' // Wettkampftempo / Sweet Spot
  | 'threshold' // Schwelle
  | 'intervals' // VO2max
  | 'hills' // Berg
  | 'technique'
  | 'strength'
  | 'brick' // Koppeleinheit
  | 'mobility'
  | 'test'
  | 'race'

export type Level = 0 | 1 | 2 // Einsteiger, Fortgeschritten, Ambitioniert
export type Focus =
  | 'mixed'
  | 'base'
  | 'intervals'
  | 'threshold'
  | 'tempo'
  | 'hills'
  | 'long'
  // Kraft
  | 'maxStrength'
  | 'hypertrophy'
  | 'strengthEndurance'
  | 'power'
  | 'stability'
export type Terrain = 'flat' | 'rolling' | 'hilly'
export type GymSplit = 'full' | 'upperLower' | 'ppl'
export type Source = 'user' | 'activity' | 'estimate' | 'watch' | 'lab'

export interface Dated<T> {
  date: string
  value: T
  source?: Source
}

export type HrMethod = 'max' | 'karvonen' | 'lthr' | 'manual'

export interface Profile {
  name: string
  birthYear?: number
  sex?: 'm' | 'f' | 'd'
  heightCm?: number
  weight: Dated<number>[]
  sports: Sport[]
  hrMax?: number
  hrRest?: number
  lthr?: number
  hrMethod: HrMethod
  /** Untergrenzen der Zonen 1–5 in Schlägen, nur bei hrMethod = manual */
  hrManual?: number[]
  /** eigene Rad-Zonen, sonst gelten die Laufzonen */
  bikeHr?: { hrMax?: number; lthr?: number; manual?: number[] }
  vo2max: (Dated<number> & { sport: 'run' | 'bike' })[]
  ftp: Dated<number>[]
  /** Schwellentempo in s/km */
  thresholdPace: Dated<number>[]
  raceResults: { date: string; distanceM: number; timeSec: number }[]
  /** CSS in s/100 m */
  css: (Dated<number> & { t400?: number; t200?: number })[]
  /** 1RM je Übung in kg */
  oneRm: Record<string, Dated<number>[]>
  units: { distance: 'km' | 'mi'; weight: 'kg' | 'lb' }
  weekStart: 0 | 6 // 0 = Montag, 6 = Sonntag
  theme: 'system' | 'light' | 'dark'
  reminder: { weekday: number; time: string; enabled: boolean }
  disclaimerSeen: boolean
  onboarded: boolean
  seenTerms: string[]
}

export type GoalType = 'race' | 'time' | 'distance' | 'strength' | 'fitness'
export interface Goal {
  id: string
  sport: Sport
  type: GoalType
  title: string
  date?: string
  distanceKm?: number
  targetTimeSec?: number
  exerciseId?: string
  targetKg?: number
  main: boolean
}

export interface PlanConfig {
  sport: Sport
  /** Kennung des Ziels innerhalb der Sportart, z. B. '10k', 'marathon', 'olympic', 'hypertrophy' */
  goal: string
  level: Level
  weeks: number
  /** Montag (bzw. erster Wochentag) der ersten Woche */
  startDate: string
  raceDate?: string
  targetTimeSec?: number
  distanceKm?: number
  sessionsPerWeek: number
  /** verfügbare Wochentage, 0 = Montag */
  days: number[]
  /** km (Laufen), Stunden (Rad, Triathlon), km (Schwimmen), Sätze (Kraft) */
  startVolume: number
  rampPct: number
  deloadEvery: 3 | 4
  /** Verschiebungen einzelner Entlastungswochen: Wochenindex -> neuer Wochenindex */
  deloadMoves?: Record<number, number>
  /** feste Entlastungswochen (Wochenindizes), z. B. beim Abgleich mit einem anderen Plan */
  deloadWeeks?: number[]
  focus: Focus
  terrain: Terrain
  split?: GymSplit
  /** Woche gegen eine andere Ausrichtung getauscht */
  weekOverrides?: Record<number, { focus?: Focus; deload?: boolean }>
  /** Umfangsfaktoren für einzelne Wochen, z. B. Wiedereinstieg nach Pause */
  weekFactors?: Record<number, number>
  /** eingeschobene Pausenwochen: ab Wochenindex n Wochen Lücke */
  gaps?: { atWeek: number; weeks: number }[]
  /** einzelne Woche ohne Pflicht-Entlastung */
  single?: boolean
  /** Tage, an denen andere Pläne harte Einheiten haben (0 = Montag) */
  avoidHardDays?: number[]
}

export interface Plan {
  id: string
  name: string
  config: PlanConfig
  createdAt: string
  status: 'active' | 'paused' | 'done' | 'ended'
  pausedAt?: string
  goalId?: string
  templateId?: string
  /** Kennungen der Abschnitte in docs/trainingslehre.md */
  basis: string[]
  followsPlanId?: string
}

export interface Step {
  part: 'Aufwärmen' | 'Hauptteil' | 'Auslaufen' | 'Technik' | 'Hinweis'
  /** Text mit Platzhaltern wie {pace:T}, {hr:2}, {pw:88-94}, {css:0}, {kg:squat:80} */
  text: string
}

export interface GymSet {
  exerciseId: string
  sets: number
  reps: string
  pct1rm?: number
  rir?: number
  restSec?: number
  note?: string
}

/** Bauanleitung einer Einheit, damit sie abgeschwächt oder neu berechnet werden kann */
export interface SessionSpec {
  builder: string
  p: Record<string, number | string | boolean | undefined>
}

export interface Session {
  id: string
  planId: string
  weekIndex: number
  date: string
  discipline: Discipline
  kind: Kind
  title: string
  steps: Step[]
  gym?: GymSet[]
  durationMin: number
  distanceKm?: number
  elevationM?: number
  /** geplante Belastung (TSS-ähnlich) */
  load: number
  hard: boolean
  /** Schlüsseleinheit des Plans */
  key: boolean
  heavyLegs?: boolean
  deload: boolean
  taper?: boolean
  spec?: SessionSpec
  status: 'planned' | 'done' | 'skipped'
  manual?: boolean
  activityId?: string
  /** bei Erledigung eingefrorene Texte mit den damals gültigen Werten */
  frozen?: { steps: Step[]; date: string }
  adjusted?: { type: 'eased' | 'replaced' | 'moved' | 'rest'; reason: string; at: string; originalTitle: string; originalDate?: string }
  /** zweite Disziplin bei Koppeleinheiten */
  timeOfDay?: 'morgens' | 'abends'
}

export interface LoggedSet {
  exerciseId: string
  reps: number
  kg: number
  rir?: number
}

export interface BestEffort {
  /** Distanz in m (Laufen) oder Dauer in s (Rad-Leistung) */
  key: number
  /** Zeit in s (Laufen) bzw. Watt (Rad) */
  value: number
}

export interface Activity {
  id: string
  source: 'gpx' | 'tcx' | 'fit' | 'csv' | 'manual'
  fileName?: string
  discipline: Discipline
  start: string // ISO mit Uhrzeit
  date: string // lokales Datum
  durationSec: number
  distanceM?: number
  elevationM?: number
  avgHr?: number
  maxHr?: number
  avgPower?: number
  np?: number
  avgCadence?: number
  rpe?: number
  load: number
  loadSource: 'power' | 'hr' | 'pace' | 'rpe' | 'duration'
  /** Sekunden in den Zonen 1–5 (Puls) bzw. 1–7 (Leistung) */
  hrZoneSec?: number[]
  powerZoneSec?: number[]
  /** Kennwerte, die beim Import galten */
  ref?: { hrMax?: number; lthr?: number; ftp?: number }
  bestEfforts?: BestEffort[]
  powerBests?: BestEffort[]
  /** Pulsdrift in Prozent (zweite Hälfte gegen erste) */
  driftPct?: number
  sets?: LoggedSet[]
  note?: string
  sessionId?: string
  /** ausgedünnter Verlauf für Diagramme: [t s, Puls, Watt, Tempo m/s, Höhe m] */
  stream?: number[][]
}

export interface RecoveryEntry {
  /** erster Tag der Woche */
  week: string
  hrv?: number
  rhr?: number
  sleepH?: number
  feeling?: number // 1 schlecht – 5 sehr gut
  soreness?: number // 1 keiner – 5 stark
  source: 'user' | 'csv'
  days?: { date: string; hrv?: number; rhr?: number; sleepH?: number }[]
}

export interface ReadinessLog {
  date: string
  sessionId: string
  symptoms: string[]
  choice: string
}

export interface CustomExercise {
  id: string
  name: string
  muscles: string[]
  pattern: string
}

export interface AppData {
  version: number
  profile: Profile
  goals: Goal[]
  plans: Plan[]
  sessions: Session[]
  activities: Activity[]
  recovery: RecoveryEntry[]
  readiness: ReadinessLog[]
  customExercises: CustomExercise[]
  customTemplates: { id: string; name: string; config: PlanConfig; basis: string[] }[]
  dismissed: string[]
}

export const DATA_VERSION = 1

export function emptyProfile(): Profile {
  return {
    name: '',
    weight: [],
    sports: [],
    hrMethod: 'max',
    vo2max: [],
    ftp: [],
    thresholdPace: [],
    raceResults: [],
    css: [],
    oneRm: {},
    units: { distance: 'km', weight: 'kg' },
    weekStart: 0,
    theme: 'system',
    reminder: { weekday: 6, time: '18:00', enabled: true },
    disclaimerSeen: false,
    onboarded: false,
    seenTerms: [],
  }
}

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    profile: emptyProfile(),
    goals: [],
    plans: [],
    sessions: [],
    activities: [],
    recovery: [],
    readiness: [],
    customExercises: [],
    customTemplates: [],
    dismissed: [],
  }
}

export const latest = <T,>(list: Dated<T>[] | undefined): Dated<T> | undefined =>
  list && list.length ? [...list].sort((a, b) => a.date.localeCompare(b.date))[list.length - 1] : undefined

/** Wert, der an einem Datum galt */
export const validAt = <T,>(list: Dated<T>[] | undefined, date: string): Dated<T> | undefined => {
  if (!list || !list.length) return undefined
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
  let hit: Dated<T> | undefined
  for (const e of sorted) if (e.date <= date) hit = e
  return hit ?? sorted[0]
}
