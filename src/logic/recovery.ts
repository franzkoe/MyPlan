// Erholung: persönlicher Normalbereich aus HRV und Ruhepuls, Wochenauswertung und
// Alternativen für einzelne Einheiten. Die App schlägt vor, sie ändert nichts von selbst
// und stellt keine Diagnosen.
import { addDays, diffDays, startOfWeek, weekday, WEEKDAYS } from './dates'
import { betterDay } from './plans'
import type { ReadinessLog, RecoveryEntry, Session } from './types'
import { build, easeSpec, easyReplacement, type BuildCtx, type Built } from './workouts'

export const BASELINE_MIN_WEEKS = 4
export const BASELINE_MAX_WEEKS = 8

export interface Band {
  value?: number
  mean: number
  sd: number
  lo: number
  hi: number
  n: number
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Tageswerte zu einem Wochenwert mitteln */
export function weeklyFromDays(days: { date: string; hrv?: number; rhr?: number; sleepH?: number }[], weekStart = 0): RecoveryEntry[] {
  const map = new Map<string, typeof days>()
  for (const d of days) {
    const w = startOfWeek(d.date, weekStart)
    map.set(w, [...(map.get(w) ?? []), d])
  }
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number' && isFinite(x))
    return v.length ? Math.round(mean(v) * 10) / 10 : undefined
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, list]) => ({ week, hrv: avg(list.map((x) => x.hrv)), rhr: avg(list.map((x) => x.rhr)), sleepH: avg(list.map((x) => x.sleepH)), source: 'csv' as const, days: list }))
}

export type RecoveryStatus = 'collecting' | 'good' | 'normal' | 'watch' | 'low'

export interface RecoveryEval {
  status: RecoveryStatus
  week: string
  hrv?: Band
  rhr?: Band
  weeksCollected: number
  weeksNeeded: number
  headline: string
  detail: string
}

/**
 * Vergleicht eine Woche mit dem eigenen Normalbereich der vorangegangenen 4 bis 8 Wochen.
 * HRV wird logarithmiert ausgewertet (ln RMSSD), der Normalbereich ist Mittelwert ± 1 Standardabweichung,
 * mindestens ± 3 % bzw. ± 2 Schläge.
 */
export function evaluateRecovery(entries: RecoveryEntry[], week: string): RecoveryEval {
  const sorted = [...entries].sort((a, b) => a.week.localeCompare(b.week))
  const cur = sorted.find((e) => e.week === week)
  const prev = sorted.filter((e) => e.week < week).slice(-BASELINE_MAX_WEEKS)
  const hrvPrev = prev.filter((e) => e.hrv).map((e) => Math.log(e.hrv!))
  const rhrPrev = prev.filter((e) => e.rhr).map((e) => e.rhr!)
  const collected = Math.max(hrvPrev.length, rhrPrev.length)
  const base: RecoveryEval = { status: 'collecting', week, weeksCollected: collected, weeksNeeded: Math.max(0, BASELINE_MIN_WEEKS - collected), headline: '', detail: '' }
  let hrv: Band | undefined
  let rhr: Band | undefined
  if (hrvPrev.length >= BASELINE_MIN_WEEKS) {
    const m = mean(hrvPrev)
    const s = Math.max(sd(hrvPrev), 0.03)
    hrv = { value: cur?.hrv, mean: Math.exp(m), sd: s, lo: Math.exp(m - s), hi: Math.exp(m + s), n: hrvPrev.length }
  }
  if (rhrPrev.length >= BASELINE_MIN_WEEKS) {
    const m = mean(rhrPrev)
    const s = Math.max(sd(rhrPrev), 2)
    rhr = { value: cur?.rhr, mean: m, sd: s, lo: m - s, hi: m + s, n: rhrPrev.length }
  }
  if (!hrv && !rhr) {
    return {
      ...base,
      headline: collected === 0 && !cur ? 'Noch keine Erholungsdaten' : 'Die App sammelt noch Daten',
      detail: `Für deinen persönlichen Normalbereich braucht es ${BASELINE_MIN_WEEKS} Wochen. Es fehlen noch ${base.weeksNeeded}. Bis dahin gibt es keine Bewertung`,
    }
  }
  const res = { ...base, hrv, rhr, weeksNeeded: 0 }
  if (!cur || (cur.hrv === undefined && cur.rhr === undefined)) return { ...res, status: 'collecting', headline: 'Für diese Woche fehlen Werte', detail: 'Trage HRV und Ruhepuls ein, dann vergleicht die App sie mit deinem Normalbereich' }
  const hrvLow = hrv && cur.hrv !== undefined && cur.hrv < hrv.lo
  const hrvHigh = hrv && cur.hrv !== undefined && cur.hrv > hrv.hi
  const rhrHigh = rhr && cur.rhr !== undefined && cur.rhr > rhr.hi
  const subj = (cur.feeling !== undefined && cur.feeling <= 2) || (cur.soreness !== undefined && cur.soreness >= 4)
  const range = hrv ? `Dein Normalbereich: HRV ${Math.round(hrv.lo)} bis ${Math.round(hrv.hi)} ms` : ''
  const rrange = rhr ? `Ruhepuls ${Math.round(rhr.lo)} bis ${Math.round(rhr.hi)}` : ''
  const both = [range, rrange].filter(Boolean).join(', ')
  if (hrvLow && rhrHigh)
    return { ...res, status: 'low', headline: 'HRV deutlich gedrückt und Ruhepuls erhöht', detail: `${both}. Beide Werte liegen außerhalb. Das spricht für unvollständige Erholung. Vorschläge für die kommende Woche stehen unten` }
  if (hrvLow || rhrHigh || (subj && !hrvHigh))
    return {
      ...res,
      status: 'watch',
      headline: hrvLow ? 'HRV unter deinem Normalbereich' : rhrHigh ? 'Ruhepuls über deinem Normalbereich' : 'Werte normal, Befinden gedrückt',
      detail: `${both}. Ein einzelner Wert außerhalb ist kein Grund, den Plan zu ändern. Achte in den harten Einheiten auf dein Gefühl`,
    }
  if (hrvHigh && !rhrHigh)
    return { ...res, status: 'good', headline: 'Gut erholt', detail: `${both}. HRV im oberen Bereich. Der Plan bleibt, wie er ist` }
  return { ...res, status: 'normal', headline: 'Erholung im Normalbereich', detail: `${both}. Der Plan bleibt, wie er ist` }
}

export interface WeekSuggestion {
  id: string
  type: 'ease' | 'move' | 'deload'
  sessionId?: string
  moveTo?: string
  text: string
  reason: string
}

/** Vorschläge für die kommende Woche bei deutlich gedrückter Erholung */
export function recoverySuggestions(ev: RecoveryEval, nextWeek: Session[], weekStartIso: string, todayIso: string, nextDeloadInWeeks?: number): WeekSuggestion[] {
  if (ev.status !== 'low') return []
  const out: WeekSuggestion[] = []
  const open = nextWeek.filter((s) => s.status === 'planned' && s.date >= todayIso)
  if (open.some((s) => s.deload)) return []
  const hard = open.filter((s) => s.hard).sort((a, b) => a.date.localeCompare(b.date))
  if (nextDeloadInWeeks !== undefined && nextDeloadInWeeks > 0 && nextDeloadInWeeks <= 2)
    out.push({ id: `deload:${weekStartIso}`, type: 'deload', text: 'Entlastungswoche vorziehen', reason: `Die nächste Entlastungswoche wäre in ${nextDeloadInWeeks === 1 ? 'einer Woche' : 'zwei Wochen'}. Sie jetzt zu nehmen kostet wenig und gibt dem Körper Zeit` })
  hard.forEach((s, i) => {
    if (i === 0) {
      const to = betterDay(s, nextWeek, weekStartIso, addDays(s.date, 1))
      if (to && to > s.date) out.push({ id: `move:${s.id}`, type: 'move', sessionId: s.id, moveTo: to, text: `„${s.title}“ auf ${WEEKDAYS[weekday(to)]} verschieben`, reason: 'Zwei zusätzliche lockere Tage am Wochenanfang, bevor die erste harte Einheit kommt' })
    }
    out.push({ id: `ease:${s.id}`, type: 'ease', sessionId: s.id, text: `„${s.title}“ abschwächen`, reason: 'Weniger Wiederholungen bei gleichem Tempo halten den Reiz, senken aber die Belastung' })
  })
  return out
}

// ---------- „Nicht gut erholt“ bei einer einzelnen Einheit ----------

export const SYMPTOMS: { id: string; label: string; illness?: boolean }[] = [
  { id: 'tired', label: 'Müde' },
  { id: 'legs', label: 'Schwere Beine' },
  { id: 'sleep', label: 'Schlecht geschlafen' },
  { id: 'sore', label: 'Muskelkater' },
  { id: 'stress', label: 'Viel Stress' },
  { id: 'sick', label: 'Angeschlagen (Hals, Schnupfen)', illness: true },
  { id: 'fever', label: 'Fieber oder Infekt', illness: true },
]

export interface Alternative {
  id: 'ease' | 'replace' | 'move' | 'rest'
  title: string
  detail: string
  reason: string
  recommended: boolean
  built?: Built
  spec?: Session['spec']
  moveTo?: string
  consequence?: string
}

export interface NotRecoveredInput {
  session: Session
  symptoms: string[]
  hrvToday?: number
  rhrToday?: number
  week: Session[]
  weekStart: string
  today: string
  lastEval?: RecoveryEval
  ctx: BuildCtx
}

export interface NotRecoveredResult {
  alternatives: Alternative[]
  note?: string
  illness: boolean
}

export function notRecovered(i: NotRecoveredInput): NotRecoveredResult {
  const s = i.session
  const fever = i.symptoms.includes('fever')
  const sick = i.symptoms.includes('sick')
  const ev = i.lastEval
  const hrvLowToday = ev?.hrv && i.hrvToday !== undefined && i.hrvToday < ev.hrv.lo
  const rhrHighToday = ev?.rhr && i.rhrToday !== undefined && i.rhrToday > ev.rhr.hi
  const weekLow = ev?.status === 'low'
  const strain = i.symptoms.length + (hrvLowToday ? 1 : 0) + (rhrHighToday ? 1 : 0) + (weekLow ? 1 : 0)
  const alts: Alternative[] = []

  const others = i.week.filter((x) => x.id !== s.id && x.status !== 'skipped')
  const dayBefore = others.filter((x) => x.date === addDays(s.date, -1))
  const dayAfter = others.filter((x) => x.date === addDays(s.date, 1))
  const context = dayBefore.some((x) => x.hard || x.kind === 'long') ? 'Gestern lag schon eine fordernde Einheit' : dayAfter.some((x) => x.hard || x.kind === 'long') ? 'Morgen folgt eine fordernde Einheit' : ''

  if (fever) {
    return {
      illness: true,
      note: 'Mit Fieber oder einem Infekt gilt: kein Training, bis du mindestens einen Tag beschwerdefrei bist. Danach locker wieder einsteigen. Halten die Beschwerden an, lass dich ärztlich beraten. Dauert die Pause länger, kannst du den Plan pausieren',
      alternatives: [{ id: 'rest', title: 'Ruhetag', detail: 'Die Einheit entfällt', reason: 'Training bei Fieber belastet den Körper zusätzlich und kann die Erkrankung verlängern', recommended: true }],
    }
  }

  // abgeschwächte Version
  if (s.spec && s.kind !== 'recovery' && s.kind !== 'mobility' && s.kind !== 'race') {
    const spec = easeSpec(s.spec)
    try {
      const built = build(spec, i.ctx)
      const what = s.discipline === 'gym' ? 'Weniger Sätze und etwa 10 % weniger Last' : s.hard ? 'Weniger Wiederholungen, gleiches Tempo' : 'Kürzer, gleiche Intensität'
      alts.push({
        id: 'ease',
        title: 'Abgeschwächte Version',
        detail: built.title,
        reason: s.key ? `${what}. Die Einheit ist wichtig für den Plan, der Reiz bleibt in kleiner Dosis erhalten` : `${what}. Der Trainingsreiz bleibt, die Belastung sinkt um etwa ein Drittel`,
        recommended: false,
        built,
        spec,
      })
    } catch {
      /* Einheit ohne passenden Baustein */
    }
  }

  // lockere Ersatzeinheit
  if (s.kind !== 'recovery' && s.kind !== 'mobility' && s.kind !== 'race') {
    const spec = easyReplacement(s.discipline, s.durationMin)
    const built = build(spec, i.ctx)
    alts.push({
      id: 'replace',
      title: 'Lockere Ersatzeinheit',
      detail: built.title,
      reason: 'Bewegung ohne Belastung fördert die Durchblutung und hält den Rhythmus, ohne zusätzlich zu ermüden',
      recommended: false,
      built,
      spec,
    })
  }

  // verschieben
  if (s.kind !== 'race') {
    const to = betterDay(s, i.week, i.weekStart, addDays(i.today > s.date ? i.today : s.date, 1), true)
    if (to) {
      const onTarget = others.filter((x) => x.date === to)
      const neighbours = others.filter((x) => Math.abs(diffDays(x.date, to)) === 1 && (x.hard || x.kind === 'long'))
      const consequence = onTarget.length
        ? `Am ${WEEKDAYS[weekday(to)]} liegt dann zusätzlich „${onTarget[0].title}“`
        : neighbours.length
          ? `Am Tag ${diffDays(neighbours[0].date, to) > 0 ? 'danach' : 'davor'} liegt „${neighbours[0].title}“. Das wird eng`
          : `Der ${WEEKDAYS[weekday(to)]} ist frei, die übrige Woche bleibt unverändert`
      alts.push({
        id: 'move',
        title: `Auf ${WEEKDAYS[weekday(to)]} verschieben`,
        detail: s.title,
        reason: s.key ? 'Die Einheit ist eine Schlüsseleinheit. Sie ausgeruht nachzuholen bringt mehr als sie heute halb zu laufen' : 'Ein zusätzlicher Tag Erholung, die Einheit bleibt vollständig erhalten',
        recommended: false,
        moveTo: to,
        consequence,
      })
    }
  }

  alts.push({
    id: 'rest',
    title: 'Ruhetag',
    detail: 'Die Einheit entfällt',
    reason: s.key ? 'Eine ausgelassene Einheit kostet weniger als eine verschleppte Ermüdung. Bei einer Schlüsseleinheit ist Verschieben meist besser' : 'Eine einzelne ausgelassene Einheit verändert den Trainingsfortschritt nicht messbar',
    recommended: false,
  })

  // Empfehlung
  let pick: Alternative['id']
  if (sick) pick = s.hard || s.kind === 'long' ? 'rest' : alts.some((a) => a.id === 'replace') ? 'replace' : 'rest'
  else if (strain >= 3) pick = s.key && alts.some((a) => a.id === 'move') ? 'move' : alts.some((a) => a.id === 'replace') ? 'replace' : 'rest'
  else if (s.key && s.hard) pick = alts.some((a) => a.id === 'move' && !a.consequence?.includes('eng')) ? 'move' : 'ease'
  else if (s.hard || s.kind === 'long' || s.heavyLegs) pick = 'ease'
  else pick = alts.some((a) => a.id === 'ease') ? 'ease' : 'rest'
  if (!alts.some((a) => a.id === pick)) pick = alts[0].id
  alts.forEach((a) => (a.recommended = a.id === pick))
  alts.sort((a, b) => Number(b.recommended) - Number(a.recommended))

  const notes: string[] = []
  if (sick) notes.push('Bei Halsschmerzen oder Schnupfen ohne Fieber ist höchstens lockere Bewegung sinnvoll. Kommen Fieber oder Gliederschmerzen dazu: Pause')
  if (weekLow) notes.push('Die letzte Wochenauswertung zeigte gedrückte HRV und erhöhten Ruhepuls')
  if (hrvLowToday) notes.push('Deine HRV von heute liegt unter deinem Normalbereich')
  if (rhrHighToday) notes.push('Dein Ruhepuls von heute liegt über deinem Normalbereich')
  if (context) notes.push(context)
  return { alternatives: alts, note: notes.join('. ') || undefined, illness: sick }
}

/** Wendet eine gewählte Alternative an. Die Änderung bleibt an der Einheit erkennbar. */
export function applyAlternative(s: Session, alt: Alternative, reason: string, at: string): Session {
  const mark = (type: NonNullable<Session['adjusted']>['type']): Session['adjusted'] => ({ type, reason, at, originalTitle: s.adjusted?.originalTitle ?? s.title, originalDate: s.adjusted?.originalDate ?? s.date })
  if (alt.id === 'move' && alt.moveTo) return { ...s, date: alt.moveTo, adjusted: mark('moved') }
  if (alt.id === 'rest') return { ...s, status: 'skipped', adjusted: mark('rest') }
  if (alt.built) return { ...s, ...alt.built, spec: alt.spec, key: s.key, adjusted: mark(alt.id === 'ease' ? 'eased' : 'replaced') }
  return s
}

/** Wurde „Nicht gut erholt“ in den letzten vier Wochen auffällig oft genutzt? */
export function overuse(logs: ReadinessLog[], todayIso: string): { count: number; flag: boolean } {
  const count = logs.filter((l) => diffDays(todayIso, l.date) <= 28 && diffDays(todayIso, l.date) >= 0).length
  return { count, flag: count >= 4 }
}

/** Ist die wöchentliche Eingabe fällig? */
export function recoveryDue(entries: RecoveryEntry[], todayIso: string, reminderWeekday: number, weekStart = 0): boolean {
  const week = startOfWeek(todayIso, weekStart)
  if (entries.some((e) => e.week === week && (e.hrv !== undefined || e.rhr !== undefined))) return false
  const pos = (d: number) => (d - weekStart + 7) % 7
  return pos(weekday(todayIso)) >= pos(reminderWeekday)
}
