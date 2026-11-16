// Abgeleitete Daten für die Ansichten
import { compliance } from './logic/analysis'
import { addDays, diffDays, fmtDate, today } from './logic/dates'
import { planWeeks, sessionVolume, VOLUME_UNIT } from './logic/generator'
import { actualVolume, weekConflicts, weekIndexAt, type Conflict } from './logic/plans'
import type { AppData, Plan, Session } from './logic/types'
import { mainPlanId } from './store'

export const activePlans = (d: AppData) => d.plans.filter((p) => p.status === 'active')
export const visiblePlanIds = (d: AppData) => new Set(d.plans.filter((p) => p.status !== 'paused').map((p) => p.id))

/** Einheiten einer Woche über alle nicht pausierten Pläne */
export function weekSessions(d: AppData, weekStart: string): Session[] {
  const ids = visiblePlanIds(d)
  const end = addDays(weekStart, 6)
  return d.sessions.filter((s) => ids.has(s.planId) && s.date >= weekStart && s.date <= end).sort((a, b) => a.date.localeCompare(b.date) || Number(b.hard) - Number(a.hard))
}

export function conflictsFor(d: AppData, weekStart: string): Conflict[] {
  const week = weekSessions(d, weekStart)
  const prev = weekSessions(d, addDays(weekStart, -7))
  const prevLoad = prev.length && !prev.every((s) => s.deload) ? prev.reduce((a, s) => a + s.load, 0) : undefined
  return weekConflicts(week, weekStart, d.plans, mainPlanId(d), prevLoad, today()).filter((c) => !d.dismissed.includes(c.id))
}

export function fmtVol(v: number, unit: string): string {
  const digits = unit === 'Sätze' ? 0 : v >= 100 ? 0 : 1
  return v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export interface PlanWeekStatus {
  plan: Plan
  unit: string
  planned: number
  actual: number
  count: number
  done: number
  weekIndex: number
  deload: boolean
  taper: boolean
}

export function planWeekStatus(d: AppData, plan: Plan, weekStart: string): PlanWeekStatus | undefined {
  const end = addDays(weekStart, 6)
  const ss = d.sessions.filter((s) => s.planId === plan.id && s.date >= weekStart && s.date <= end && s.kind !== 'race')
  if (!ss.length) return undefined
  const acts = new Map(d.activities.map((a) => [a.id, a]))
  const info = plan.config.single ? undefined : planWeeks(plan.config).find((w) => w.start === weekStart)
  return {
    plan,
    unit: VOLUME_UNIT[plan.config.sport],
    planned: ss.filter((s) => s.status !== 'skipped' || true).reduce((a, s) => a + sessionVolume(plan.config.sport, s), 0),
    actual: ss.reduce((a, s) => a + actualVolume(plan.config.sport, s, s.activityId ? acts.get(s.activityId) : undefined), 0),
    count: ss.length,
    done: ss.filter((s) => s.status === 'done').length,
    weekIndex: info?.index ?? weekIndexAt(plan.config, weekStart),
    deload: info?.deload ?? ss.every((s) => s.deload),
    taper: !!info?.taper,
  }
}

export function planProgress(d: AppData, plan: Plan): { sentence: string; detail: string; week: number; weeks: number; rate: number; tone: 'good' | 'warn' | 'bad' | 'info' } {
  const t = today()
  const mine = d.sessions.filter((s) => s.planId === plan.id)
  const c = compliance(mine, t)
  const weeks = plan.config.weeks
  const week = Math.min(weeks, Math.max(1, weekIndexAt(plan.config, t) + 1))
  if (plan.status === 'paused') return { sentence: 'Der Plan ist pausiert', detail: plan.pausedAt ? `seit ${fmtDate(plan.pausedAt)}` : '', week, weeks, rate: c.rate, tone: 'info' }
  if (t < plan.config.startDate) return { sentence: `Der Plan beginnt am ${fmtDate(plan.config.startDate)}`, detail: `in ${diffDays(plan.config.startDate, t)} Tagen`, week: 0, weeks, rate: 0, tone: 'info' }
  if (c.due < 2) return { sentence: 'Der Plan hat gerade begonnen', detail: `Woche ${week} von ${weeks}`, week, weeks, rate: c.rate, tone: 'info' }
  const detail = `${c.done} von ${c.due} Einheiten erledigt, Woche ${week} von ${weeks}`
  if (c.rate >= 0.85) return { sentence: 'Du liegst im Plan', detail, week, weeks, rate: c.rate, tone: 'good' }
  if (c.rate >= 0.6) return { sentence: 'Du liegst etwas hinter dem Plan', detail, week, weeks, rate: c.rate, tone: 'warn' }
  return { sentence: 'Du liegst deutlich hinter dem Plan', detail, week, weeks, rate: c.rate, tone: 'bad' }
}
