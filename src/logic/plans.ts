// Laufende Pläne anpassen, pausieren, kombinieren und als Grundlage für neue Pläne nutzen.
import { addDays, diffDays, startOfWeek, weekday, WEEKDAYS } from './dates'
import { deloadWeeks, generatePlan, maxBuildStreak, planWeeks, sessionVolume, taperWeeks, weekStartDate } from './generator'
import type { Activity, Plan, PlanConfig, Session } from './types'
import type { BuildCtx } from './workouts'

// ---------- Neuberechnung ----------

export interface RecalcResult {
  sessions: Session[]
  /** ab diesem Datum wurde neu berechnet */
  from: string
  changes: { week: number; start: string; before: number; after: number; countBefore: number; countAfter: number }[]
  keptManual: number
}

/**
 * Berechnet nur die noch offenen Wochen neu. Erledigte Einheiten, die laufende Woche und
 * von Hand geänderte Einheiten bleiben erhalten (außer releaseManual ist gesetzt).
 */
export function recalcPlan(plan: Plan, old: Session[], cfg: PlanConfig, ctx: BuildCtx, todayIso: string, weekStart = 0, releaseManual = false): RecalcResult {
  const started = old.some((s) => s.status !== 'planned') || todayIso >= cfg.startDate
  const from = started ? addDays(startOfWeek(todayIso, weekStart), 7) : cfg.startDate
  const fresh = generatePlan(plan.id, cfg, ctx, weekStart)
  const isManual = (s: Session) => !!s.manual || !!s.adjusted
  const kept = old.filter((s) => s.date < from || s.status !== 'planned' || (isManual(s) && !releaseManual))
  const keptIds = new Set(kept.map((s) => s.id))
  const keptManual = kept.filter((s) => s.date >= from && s.status === 'planned').length
  const added = fresh.filter((s) => s.date >= from && !keptIds.has(s.id))
  const sessions = [...kept, ...added].sort((a, b) => a.date.localeCompare(b.date))
  const changes: RecalcResult['changes'] = []
  for (const w of planWeeks(cfg)) {
    if (addDays(w.start, 6) < from) continue
    const inWeek = (s: Session) => s.date >= w.start && s.date <= addDays(w.start, 6)
    const b = old.filter(inWeek)
    const a = sessions.filter(inWeek)
    const vb = b.reduce((x, s) => x + sessionVolume(cfg.sport, s), 0)
    const va = a.reduce((x, s) => x + sessionVolume(cfg.sport, s), 0)
    if (Math.abs(vb - va) > 0.05 || b.length !== a.length || b.some((s, i) => s.title !== a[i]?.title || s.date !== a[i]?.date))
      changes.push({ week: w.index, start: w.start, before: vb, after: va, countBefore: b.length, countAfter: a.length })
  }
  // Wochen, die es im neuen Plan nicht mehr gibt
  const lastEnd = addDays(weekStartDate(cfg, cfg.weeks - 1), 6)
  const dropped = old.filter((s) => s.date > lastEnd && s.date >= from && s.status === 'planned' && !keptIds.has(s.id))
  if (dropped.length) changes.push({ week: cfg.weeks, start: addDays(lastEnd, 1), before: dropped.reduce((x, s) => x + sessionVolume(cfg.sport, s), 0), after: 0, countBefore: dropped.length, countAfter: 0 })
  return { sessions, from, changes, keptManual }
}

// ---------- Pause und Wiedereinstieg ----------

export interface ResumeProposal {
  daysPaused: number
  shiftWeeks: number
  factors: number[]
  text: string
  cfg: PlanConfig
  restart: boolean
}

/** Index der Woche, in der ein Datum liegt (ggf. die nächste, wenn es in einer Lücke liegt) */
export function weekIndexAt(cfg: PlanConfig, date: string): number {
  for (let i = cfg.weeks - 1; i >= 0; i--) if (weekStartDate(cfg, i) <= date) return i
  return 0
}

/**
 * Vorschlag für den Wiedereinstieg nach einer Pause. Je länger die Pause, desto vorsichtiger:
 * Die ersten Wochen laufen mit reduziertem Umfang. Ohne Zieldatum verschiebt sich der Plan um die Pause.
 */
export function proposeResume(plan: Plan, todayIso: string, weekStart = 0): ResumeProposal {
  const cfg = plan.config
  const pausedAt = plan.pausedAt ?? todayIso
  const days = Math.max(0, diffDays(todayIso, pausedAt))
  const factors = days < 7 ? [0.9] : days < 14 ? [0.7, 0.9] : days < 28 ? [0.5, 0.7, 0.85] : [0.4, 0.55, 0.7, 0.85]
  const restart = days >= 28
  const idx = weekIndexAt(cfg, pausedAt)
  const resumeWeek = startOfWeek(todayIso, weekStart)
  const shiftWeeks = cfg.raceDate ? 0 : Math.max(0, Math.round(diffDays(resumeWeek, startOfWeek(pausedAt, weekStart)) / 7))
  const next: PlanConfig = { ...cfg, weekFactors: { ...(cfg.weekFactors ?? {}) }, gaps: [...(cfg.gaps ?? [])] }
  if (shiftWeeks > 0) next.gaps!.push({ atWeek: idx, weeks: shiftWeeks })
  const first = cfg.raceDate ? weekIndexAt(cfg, todayIso) : idx
  factors.forEach((f, k) => {
    const i = first + k
    if (i < cfg.weeks) next.weekFactors![i] = Math.min(next.weekFactors![i] ?? 1, f)
  })
  const pct = factors.map((f) => `${Math.round(f * 100)} %`).join(', dann ')
  let text =
    days < 7
      ? `Kurze Pause von ${days} Tagen. Die erste Woche läuft mit ${pct} des geplanten Umfangs, danach geht es normal weiter`
      : `Nach ${days} Tagen Pause steigst du mit reduziertem Umfang wieder ein: ${pct} des Plans, danach wie geplant`
  if (shiftWeeks > 0) text += `. Der Plan verschiebt sich um ${shiftWeeks} ${shiftWeeks === 1 ? 'Woche' : 'Wochen'} nach hinten`
  if (cfg.raceDate && days >= 7) text += '. Das Zieldatum bleibt, die verpassten Wochen entfallen. Prüfe, ob die Zielzeit noch passt'
  if (restart) text += '. Nach vier Wochen oder mehr ist ein neuer Plan mit niedrigerem Startumfang meist die bessere Wahl'
  return { daysPaused: days, shiftWeeks, factors, text, cfg: next, restart }
}

// ---------- Entlastungswochen verschieben ----------

export function moveDeload(cfg: PlanConfig, from: number, to: number): { cfg?: PlanConfig; error?: string } {
  const current = deloadWeeks(cfg)
  if (!current.includes(from)) return { error: 'In dieser Woche liegt keine Entlastung' }
  const nonTaper = cfg.weeks - taperWeeks(cfg)
  if (to < 0 || to >= nonTaper) return { error: 'Dorthin lässt sich die Entlastungswoche nicht legen' }
  const next: PlanConfig = { ...cfg, deloadWeeks: current.map((i) => (i === from ? to : i)).sort((a, b) => a - b), deloadMoves: undefined }
  if (new Set(next.deloadWeeks).size !== current.length) return { error: 'Dort liegt schon eine Entlastungswoche' }
  if (maxBuildStreak(next) > 4) return { error: 'So entstünden mehr als vier Aufbauwochen am Stück. Verschiebe höchstens um eine Woche' }
  return { cfg: next }
}

// ---------- Erfahrungen aus einem Plan ----------

export interface Experience {
  weeksDone: number
  planned: number
  done: number
  compliance: number
  /** tatsächlicher Wochenumfang der letzten drei Wochen (Mittel) */
  recentActual: number
  peakActual: number
  /** mittlere Steigerung in Wochen mit guter Erfüllung, in Prozent */
  toleratedRamp?: number
  weekly: { start: string; planned: number; actual: number; rate: number }[]
  suggestion: { startVolume: number; rampPct: number; text: string }
}

/** Ist-Umfang einer Einheit: aus der verknüpften Aktivität, sonst aus dem Soll, wenn erledigt */
export function actualVolume(sport: PlanConfig['sport'], s: Session, act?: Activity): number {
  if (s.status !== 'done') return 0
  if (act) {
    if (sport === 'run' || sport === 'swim') return act.discipline === (sport === 'run' ? 'run' : 'swim') ? (act.distanceM ?? 0) / 1000 : 0
    if (sport === 'gym') return act.sets?.length ?? sessionVolume(sport, s)
    return act.durationSec / 3600
  }
  return sessionVolume(sport, s)
}

export function experience(plan: Plan, sessions: Session[], activities: Activity[], todayIso: string): Experience {
  const cfg = plan.config
  const acts = new Map(activities.map((a) => [a.id, a]))
  const mine = sessions.filter((s) => s.planId === plan.id)
  const weekly: Experience['weekly'] = []
  for (const w of planWeeks(cfg)) {
    const end = addDays(w.start, 6)
    if (end >= todayIso && plan.status !== 'done') break
    const ss = mine.filter((s) => s.date >= w.start && s.date <= end && s.kind !== 'race')
    const planned = ss.reduce((a, s) => a + sessionVolume(cfg.sport, s), 0)
    const actual = ss.reduce((a, s) => a + actualVolume(cfg.sport, s, s.activityId ? acts.get(s.activityId) : undefined), 0)
    const cnt = ss.length
    weekly.push({ start: w.start, planned, actual, rate: cnt ? ss.filter((s) => s.status === 'done').length / cnt : 0 })
  }
  const past = mine.filter((s) => s.date < todayIso || s.status === 'done')
  const done = past.filter((s) => s.status === 'done').length
  const last3 = weekly.slice(-3)
  const recentActual = last3.length ? last3.reduce((a, w) => a + w.actual, 0) / last3.length : 0
  const peakActual = weekly.reduce((a, w) => Math.max(a, w.actual), 0)
  const ramps: number[] = []
  for (let i = 1; i < weekly.length; i++) {
    const a = weekly[i - 1]
    const b = weekly[i]
    if (a.rate >= 0.8 && b.rate >= 0.8 && a.actual > 0 && b.actual > a.actual) ramps.push((b.actual / a.actual - 1) * 100)
  }
  const toleratedRamp = ramps.length >= 2 ? ramps.reduce((x, y) => x + y, 0) / ramps.length : undefined
  const compliance = past.length ? done / past.length : 0
  const startVolume = recentActual > 0 ? Math.round(recentActual * 10) / 10 : cfg.startVolume
  let rampPct = cfg.rampPct
  let why = `Die Steigerung bleibt bei ${cfg.rampPct} %`
  if (compliance < 0.7 && past.length >= 6) {
    rampPct = Math.max(2, Math.round(cfg.rampPct * 0.6))
    why = `Du hast ${Math.round(compliance * 100)} % der Einheiten geschafft. Deshalb eine vorsichtigere Steigerung von ${rampPct} %`
  } else if (toleratedRamp !== undefined) {
    rampPct = Math.min(10, Math.max(2, Math.round(toleratedRamp)))
    why = `In vollständig trainierten Wochen bist du im Mittel um ${Math.round(toleratedRamp)} % gestiegen. Vorschlag: ${rampPct} %`
  }
  const text = recentActual > 0 ? `Start mit ${startVolume.toLocaleString('de-DE')} pro Woche, dem Mittel deiner letzten Wochen. ${why}` : `Noch keine abgeschlossenen Wochen. Es gelten die Werte des alten Plans. ${why}`
  return { weeksDone: weekly.length, planned: past.length, done, compliance, recentActual, peakActual, toleratedRamp, weekly, suggestion: { startVolume, rampPct, text } }
}

// ---------- Pläne aufeinander abstimmen ----------

/** Wochentage (0 = Montag), an denen ein Plan üblicherweise harte Einheiten oder schwere Beine hat */
export function hardWeekdays(sessions: Session[]): number[] {
  const count = new Map<number, number>()
  const weeks = new Set(sessions.map((s) => s.weekIndex)).size || 1
  for (const s of sessions) if (s.hard || s.heavyLegs || s.kind === 'long') count.set(weekday(s.date), (count.get(weekday(s.date)) ?? 0) + 1)
  return [...count.entries()].filter(([, c]) => c >= weeks / 2).map(([d]) => d).sort()
}

/** Wählt n Trainingstage, die harte Tage anderer Pläne meiden und möglichst gleichmäßig verteilt sind */
export function suggestDays(n: number, avoid: number[], avoidDayBefore: boolean): number[] {
  const k = Math.min(6, Math.max(1, n))
  let best: number[] = []
  let bestScore = -Infinity
  const rec = (start: number, pick: number[]) => {
    if (pick.length === k) {
      let score = 0
      let min = 7
      for (let a = 0; a < pick.length; a++) for (let b = a + 1; b < pick.length; b++) min = Math.min(min, Math.min(Math.abs(pick[a] - pick[b]), 7 - Math.abs(pick[a] - pick[b])))
      score += (pick.length > 1 ? min : 3) * 5
      for (const d of pick) {
        if (avoid.includes(d)) score -= 20
        if (avoidDayBefore && avoid.includes((d + 1) % 7)) score -= 15
      }
      if (score > bestScore) {
        bestScore = score
        best = [...pick]
      }
      return
    }
    for (let d = start; d < 7; d++) rec(d + 1, [...pick, d])
  }
  rec(0, [])
  return best
}

/** Baut einen neuen Plan um bestehende herum: gleiche Entlastungswochen, harte Tage versetzt. */
export function alignWithPlans(cfg0: PlanConfig, others: { plan: Plan; sessions: Session[] }[], keepDays = false): PlanConfig {
  const active = others.filter((o) => o.plan.status === 'active' && !o.plan.config.single)
  if (!active.length) return cfg0
  const avoid = [...new Set(active.flatMap((o) => hardWeekdays(o.sessions.filter((s) => s.status === 'planned'))))]
  const cfg = keepDays || cfg0.sport === 'tri' ? cfg0 : { ...cfg0, days: suggestDays(cfg0.sessionsPerWeek, avoid, cfg0.sport === 'gym') }
  const deloadStarts = new Set<string>()
  let overlap = false
  for (const o of active) {
    const weeks = planWeeks(o.plan.config)
    for (const w of weeks) {
      if (w.deload) deloadStarts.add(w.start)
      if (w.start >= cfg.startDate && w.start <= weekStartDate(cfg, cfg.weeks - 1)) overlap = true
    }
  }
  const next: PlanConfig = { ...cfg, avoidHardDays: avoid }
  if (!overlap) return next
  const nonTaper = cfg.weeks - taperWeeks(cfg)
  const own = deloadWeeks({ ...cfg, deloadWeeks: undefined, deloadMoves: undefined })
  const matched: number[] = []
  for (let i = 0; i < nonTaper; i++) if (deloadStarts.has(weekStartDate(cfg, i))) matched.push(i)
  if (!matched.length) return next
  // Lücken mit eigenen Entlastungswochen füllen, damit nie mehr als vier Aufbauwochen entstehen
  const result = new Set(matched)
  const tooLong = () => maxBuildStreak({ ...next, deloadWeeks: [...result] }) > 4
  for (const i of own) {
    if (!tooLong()) break
    if (![...result].some((r) => Math.abs(r - i) <= 1)) result.add(i)
  }
  for (let i = cfg.deloadEvery - 1; tooLong() && i < nonTaper; i++) {
    const probe = new Set(result).add(i)
    if (maxBuildStreak({ ...next, deloadWeeks: [...probe] }) < maxBuildStreak({ ...next, deloadWeeks: [...result] })) result.add(i)
  }
  return { ...next, deloadWeeks: [...result].sort((a, b) => a - b), deloadMoves: undefined }
}

// ---------- Konflikte in einer gemeinsamen Woche ----------

export interface Conflict {
  id: string
  rule: 'hardConsecutive' | 'legsBeforeHard' | 'sameDay' | 'noRestDay' | 'loadJump' | 'deloadMismatch'
  text: string
  /** Begründung in einem Satz */
  reason: string
  sessionId?: string
  moveTo?: string
  action?: 'move' | 'skip' | 'alignDeload'
  severity: 'warn' | 'info'
}

const isEndurance = (s: Session) => s.discipline === 'run' || s.discipline === 'bike' || s.discipline === 'swim'
const stress = (s: Session) => s.hard || s.kind === 'long' || s.kind === 'race'
const dayName = (d: string) => WEEKDAYS[weekday(d)]

/** Sucht in der Woche einen besseren Tag für eine Einheit */
export function betterDay(s: Session, week: Session[], weekStart: string, todayIso: string, force = false): string | undefined {
  let best: string | undefined
  let bestScore = -Infinity
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    if (d === s.date || d < todayIso) continue
    const others = week.filter((x) => x.id !== s.id && x.status !== 'skipped')
    const on = others.filter((x) => x.date === d)
    const prev = others.filter((x) => x.date === addDays(d, -1))
    const next = others.filter((x) => x.date === addDays(d, 1))
    let score = 0
    if (stress(s)) {
      if (on.some(stress)) score -= 30
      if (prev.some(stress)) score -= 20
      if (next.some(stress)) score -= 20
      if (prev.some((x) => x.heavyLegs)) score -= 25
    }
    if (s.heavyLegs) {
      if (next.some((x) => stress(x) && isEndurance(x))) score -= 30
      // Schwere Beine nach der harten Ausdauereinheit am selben Tag sind in Ordnung
      if (on.some((x) => stress(x) && isEndurance(x))) score += 4
    }
    score -= on.length * 6
    const restDays = new Set([...others.filter((x) => x.date !== d).map((x) => x.date), d]).size
    if (restDays >= 7) score -= 40
    score -= Math.abs(diffDays(d, s.date)) * 0.5
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return force || bestScore > -15 ? best : undefined
}

export function weekConflicts(
  week: Session[],
  weekStart: string,
  plans: Plan[],
  mainPlanId: string | undefined,
  prevWeekLoad: number | undefined,
  todayIso: string,
): Conflict[] {
  const out: Conflict[] = []
  const ss = week.filter((s) => s.status !== 'skipped').sort((a, b) => a.date.localeCompare(b.date))
  const open = (s: Session) => s.status === 'planned' && s.date >= todayIso
  const lessImportant = (a: Session, b: Session) => {
    if (a.planId !== b.planId && mainPlanId) return a.planId === mainPlanId ? b : a
    if (a.key !== b.key) return a.key ? b : a
    return b
  }
  const seen = new Set<string>()
  const push = (c: Conflict) => {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      out.push(c)
    }
  }

  for (const a of ss) {
    for (const b of ss) {
      if (a.id === b.id) continue
      // harte Einheiten an aufeinanderfolgenden Tagen
      if (a.hard && b.hard && addDays(a.date, 1) === b.date) {
        const mv = [lessImportant(a, b), a, b].find(open)
        const to = mv ? betterDay(mv, ss, weekStart, todayIso) : undefined
        push({
          id: `hard:${a.id}:${b.id}`,
          rule: 'hardConsecutive',
          severity: 'warn',
          text: `Harte Einheiten an zwei Tagen hintereinander: ${dayName(a.date)} und ${dayName(b.date)}`,
          reason: mv && to ? `„${mv.title}“ auf ${dayName(to)} legen, damit zwischen harten Einheiten ein lockerer Tag liegt` : 'Zwischen zwei harten Einheiten sollte mindestens ein lockerer Tag liegen',
          sessionId: mv?.id,
          moveTo: to,
          action: mv && to ? 'move' : undefined,
        })
      }
      // schweres Beintraining am Tag vor Intervallen oder dem langen Lauf
      if (a.heavyLegs && isEndurance(b) && stress(b) && b.discipline !== 'swim' && addDays(a.date, 1) === b.date) {
        const mv = open(a) ? a : open(b) ? b : undefined
        const to = mv ? betterDay(mv, ss, weekStart, todayIso) : undefined
        push({
          id: `legs:${a.id}:${b.id}`,
          rule: 'legsBeforeHard',
          severity: 'warn',
          text: `Schweres Beintraining am ${dayName(a.date)}, am Tag darauf „${b.title}“`,
          reason: mv && to ? `„${mv.title}“ auf ${dayName(to)} legen, damit die Beine für die Schlüsseleinheit frisch sind` : 'Müde Beine verschlechtern die Qualität der Schlüsseleinheit',
          sessionId: mv?.id,
          moveTo: to,
          action: mv && to ? 'move' : undefined,
        })
      }
      // Kraft und Ausdauer am selben Tag
      if (a.date === b.date && a.discipline === 'gym' && a.kind === 'strength' && isEndurance(b)) {
        const first = mainPlanId && a.planId === mainPlanId ? a : mainPlanId && b.planId === mainPlanId ? b : stress(b) ? b : a
        push({
          id: `same:${a.id}:${b.id}`,
          rule: 'sameDay',
          severity: 'info',
          text: `${dayName(a.date)}: Kraft und Ausdauer am selben Tag`,
          reason: `Zuerst „${first.title}“, weil sie für dein Hauptziel wichtiger ist. Danach möglichst sechs Stunden Abstand`,
        })
      }
    }
  }

  // mindestens ein vollständiger Ruhetag
  const days = new Set(ss.map((s) => s.date))
  if (days.size >= 7) {
    const cand = ss.filter((s) => open(s) && !s.key && !s.hard).sort((a, b) => a.load - b.load)[0]
    push({
      id: `rest:${weekStart}`,
      rule: 'noRestDay',
      severity: 'warn',
      text: 'In dieser Woche gibt es keinen freien Tag',
      reason: cand ? `„${cand.title}“ am ${dayName(cand.date)} auslassen, weil sie die am wenigsten wichtige Einheit der Woche ist` : 'Mindestens ein vollständiger Ruhetag pro Woche gehört in jeden Plan',
      sessionId: cand?.id,
      action: cand ? 'skip' : undefined,
    })
  }

  // Gesamtbelastung über alle Sportarten
  const load = ss.reduce((a, s) => a + s.load, 0)
  if (prevWeekLoad && prevWeekLoad > 100 && load > prevWeekLoad * 1.3 && !ss.some((s) => s.kind === 'race')) {
    push({
      id: `load:${weekStart}`,
      rule: 'loadJump',
      severity: 'info',
      text: `Die Gesamtbelastung steigt gegenüber der Vorwoche um ${Math.round((load / prevWeekLoad - 1) * 100)} %`,
      reason: 'Alle Sportarten zusammen zählen. Nach einer Entlastungswoche ist ein Anstieg normal, sonst lieber eine Einheit kürzen',
    })
  }

  // Entlastungswochen aller Pläne in derselben Woche
  const byPlan = new Map<string, Session[]>()
  for (const s of ss) byPlan.set(s.planId, [...(byPlan.get(s.planId) ?? []), s])
  const flags = [...byPlan.entries()].filter(([id]) => plans.find((p) => p.id === id && !p.config.single)).map(([id, list]) => ({ id, deload: list.every((s) => s.deload || s.manual) && list.some((s) => s.deload) }))
  if (flags.length > 1 && flags.some((f) => f.deload) && flags.some((f) => !f.deload)) {
    const names = (d: boolean) => flags.filter((f) => f.deload === d).map((f) => plans.find((p) => p.id === f.id)?.name).join(', ')
    push({
      id: `deload:${weekStart}`,
      rule: 'deloadMismatch',
      severity: 'warn',
      text: `Entlastungswoche in „${names(true)}“, aber Aufbau in „${names(false)}“`,
      reason: 'Entlastung wirkt nur, wenn die Gesamtbelastung sinkt. Die Entlastungswochen der Pläne sollten in dieselbe Woche fallen',
      action: 'alignDeload',
    })
  }
  return out
}
