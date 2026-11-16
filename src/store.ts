// Zustand der App, Speicherung und alle Handlungen. Jede größere Änderung lässt sich rückgängig machen.
import { create } from 'zustand'
import { loadData, saveData } from './db'
import { addDays, startOfWeek, today } from './logic/dates'
import { buildCtx, deloadWeeks, generatePlan, planWeeks } from './logic/generator'
import { isDuplicate, matchSession, summarizeActivity, type RawActivity } from './logic/importer'
import { tssHr, tssRpe } from './logic/load'
import { alignWithPlans, recalcPlan, weekIndexAt } from './logic/plans'
import { applyAlternative, weeklyFromDays, type Alternative } from './logic/recovery'
import { emptyData, type Activity, type AppData, type Goal, type LoggedSet, type Plan, type PlanConfig, type Profile, type RecoveryEntry, type Session } from './logic/types'
import { build, type BuildCtx } from './logic/workouts'
import { effectiveHrMax, refsFromProfile, renderText } from './logic/zones'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

interface Toast {
  text: string
  undo?: boolean
  id: number
}

interface Store {
  data: AppData
  loaded: boolean
  history: AppData[]
  toast?: Toast
  /** Änderung mit Rückgängig-Möglichkeit */
  change: (fn: (d: AppData) => void, message?: string) => void
  /** stille Änderung ohne Eintrag in der Rückgängig-Liste */
  patch: (fn: (d: AppData) => void) => void
  undo: () => void
  say: (text: string) => void
  clearToast: () => void
  replaceAll: (d: AppData) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const persist = (d: AppData) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveData(d), 250)
}
const clone = <T,>(x: T): T => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)))
let toastId = 0

export const useStore = create<Store>((set, get) => ({
  data: emptyData(),
  loaded: false,
  history: [],
  change: (fn, message) => {
    const before = get().data
    const next = clone(before)
    fn(next)
    persist(next)
    set({ data: next, history: [...get().history.slice(-14), before], toast: message ? { text: message, undo: true, id: ++toastId } : get().toast })
  },
  patch: (fn) => {
    const next = clone(get().data)
    fn(next)
    persist(next)
    set({ data: next })
  },
  undo: () => {
    const h = get().history
    if (!h.length) return
    const prev = h[h.length - 1]
    persist(prev)
    set({ data: prev, history: h.slice(0, -1), toast: { text: 'Rückgängig gemacht', id: ++toastId } })
  },
  say: (text) => set({ toast: { text, id: ++toastId } }),
  clearToast: () => set({ toast: undefined }),
  replaceAll: (d) => {
    const before = get().data
    persist(d)
    set({ data: d, history: [...get().history.slice(-14), before] })
  },
}))

export async function boot() {
  const data = await loadData()
  useStore.setState({ data, loaded: true })
}

const S = () => useStore.getState()

// ---------- Hilfen ----------

export function ctxFor(data: AppData, level: 0 | 1 | 2): BuildCtx {
  return buildCtx(level, refsFromProfile(data.profile))
}

export const weekStartOf = (data: AppData, date = today()) => startOfWeek(date, data.profile.weekStart)

export function mainPlanId(data: AppData): string | undefined {
  const mainGoal = data.goals.find((g) => g.main)
  const active = data.plans.filter((p) => p.status === 'active' && !p.config.single)
  return active.find((p) => p.goalId && p.goalId === mainGoal?.id)?.id ?? active[0]?.id
}

/** Texte einer Einheit mit eigenen Werten. Erledigte Einheiten zeigen die damals gültigen Werte. */
export function sessionSteps(data: AppData, s: Session) {
  if (s.frozen) return s.frozen.steps
  const refs = refsFromProfile(data.profile, today())
  return s.steps.map((st) => ({ ...st, text: renderText(st.text, refs) }))
}

// ---------- Pläne ----------

export function createPlan(name: string, cfg: PlanConfig, basis: string[], opts: { goal?: Omit<Goal, 'id'>; templateId?: string; followsPlanId?: string; align?: boolean } = {}): string {
  const id = uid()
  S().change((d) => {
    let config = cfg
    if (opts.align !== false && !cfg.single) {
      const others = d.plans.map((plan) => ({ plan, sessions: d.sessions.filter((s) => s.planId === plan.id) }))
      config = alignWithPlans(cfg, others, true)
    }
    let goalId: string | undefined
    if (opts.goal) {
      goalId = uid()
      const main = opts.goal.main || !d.goals.some((g) => g.main)
      if (main) d.goals.forEach((g) => (g.main = false))
      d.goals.push({ ...opts.goal, id: goalId, main })
    }
    const plan: Plan = { id, name, config, createdAt: today(), status: 'active', goalId, templateId: opts.templateId, basis, followsPlanId: opts.followsPlanId }
    d.plans.push(plan)
    d.sessions.push(...generatePlan(id, config, ctxFor(d, config.level), d.profile.weekStart))
  }, `Plan „${name}“ angelegt`)
  return id
}

export function applyRecalc(planId: string, cfg: PlanConfig, releaseManual = false, message = 'Plan neu berechnet') {
  S().change((d) => {
    const plan = d.plans.find((p) => p.id === planId)
    if (!plan) return
    const r = recalcPlan(plan, d.sessions.filter((s) => s.planId === planId), cfg, ctxFor(d, cfg.level), today(), d.profile.weekStart, releaseManual)
    plan.config = cfg
    d.sessions = [...d.sessions.filter((s) => s.planId !== planId), ...r.sessions]
  }, message)
}

export function previewRecalc(data: AppData, planId: string, cfg: PlanConfig, releaseManual = false) {
  const plan = data.plans.find((p) => p.id === planId)
  if (!plan) return undefined
  return recalcPlan(plan, data.sessions.filter((s) => s.planId === planId), cfg, ctxFor(data, cfg.level), today(), data.profile.weekStart, releaseManual)
}

export function setPlanStatus(planId: string, status: Plan['status']) {
  const label = { active: 'Plan fortgesetzt', paused: 'Plan pausiert', done: 'Plan abgeschlossen', ended: 'Plan beendet' }[status]
  S().change((d) => {
    const plan = d.plans.find((p) => p.id === planId)
    if (!plan) return
    plan.status = status
    if (status === 'paused') plan.pausedAt = today()
    if (status === 'active') plan.pausedAt = undefined
    if (status === 'ended' || status === 'done') d.sessions = d.sessions.filter((s) => s.planId !== planId || s.status !== 'planned' || s.date < today())
  }, label)
}

export function resumePlan(planId: string, cfg: PlanConfig) {
  S().change((d) => {
    const plan = d.plans.find((p) => p.id === planId)
    if (!plan) return
    const pausedAt = plan.pausedAt ?? today()
    // verpasste Einheiten aus der Pause gelten als ausgelassen bzw. werden neu berechnet
    const mine = d.sessions.filter((s) => s.planId === planId)
    const keep = mine.filter((s) => s.status !== 'planned' || s.date < pausedAt)
    const fresh = generatePlan(planId, cfg, ctxFor(d, cfg.level), d.profile.weekStart).filter((s) => s.date >= today())
    const keepIds = new Set(keep.map((s) => s.id))
    plan.config = cfg
    plan.status = 'active'
    plan.pausedAt = undefined
    d.sessions = [...d.sessions.filter((s) => s.planId !== planId), ...keep, ...fresh.filter((s) => !keepIds.has(s.id))]
  }, 'Plan fortgesetzt')
}

export function deletePlan(planId: string) {
  S().change((d) => {
    d.plans = d.plans.filter((p) => p.id !== planId)
    d.sessions = d.sessions.filter((s) => s.planId !== planId)
  }, 'Plan gelöscht')
}

/** Entlastungswochen eines Plans an einen anderen angleichen */
export function alignDeloads(data: AppData, planId: string): PlanConfig | undefined {
  const plan = data.plans.find((p) => p.id === planId)
  if (!plan) return undefined
  const others = data.plans.filter((p) => p.id !== planId).map((p) => ({ plan: p, sessions: data.sessions.filter((s) => s.planId === p.id) }))
  return alignWithPlans({ ...plan.config, deloadWeeks: undefined, deloadMoves: undefined }, others, true)
}

export function saveAsTemplate(planId: string, name: string) {
  S().change((d) => {
    const plan = d.plans.find((p) => p.id === planId)
    if (plan) d.customTemplates.push({ id: uid(), name, config: { ...plan.config, raceDate: undefined, gaps: undefined, weekFactors: undefined, deloadWeeks: undefined, avoidHardDays: undefined }, basis: plan.basis })
  }, 'Als eigene Vorlage gespeichert')
}

// ---------- Einheiten ----------

export function updateSession(id: string, fn: (s: Session) => void, message?: string) {
  S().change((d) => {
    const s = d.sessions.find((x) => x.id === id)
    if (s) fn(s)
  }, message)
}

export function moveSession(id: string, date: string) {
  updateSession(id, (s) => {
    s.date = date
    s.manual = true
  }, 'Einheit verschoben')
}

export function swapSessions(a: string, b: string) {
  S().change((d) => {
    const x = d.sessions.find((s) => s.id === a)
    const y = d.sessions.find((s) => s.id === b)
    if (!x || !y) return
    const t = x.date
    x.date = y.date
    y.date = t
    x.manual = y.manual = true
  }, 'Einheiten getauscht')
}

export function deleteSession(id: string) {
  S().change((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== id)
  }, 'Einheit gelöscht')
}

export function addSession(planId: string, date: string, spec: Session['spec'] & {}, extra: Partial<Session> = {}): string {
  const id = uid()
  S().change((d) => {
    const plan = d.plans.find((p) => p.id === planId)
    const level = plan?.config.level ?? 1
    const b = build(spec, ctxFor(d, level))
    d.sessions.push({ id, planId, weekIndex: plan ? weekIndexAt(plan.config, date) : 0, date, ...b, key: false, deload: false, spec, status: 'planned', manual: true, ...extra })
  }, 'Einheit hinzugefügt')
  return id
}

/** Plan für freie Einheiten ohne eigenen Plan */
export function freePlanId(): string {
  const d = S().data
  const hit = d.plans.find((p) => p.templateId === 'frei')
  if (hit) return hit.id
  const id = uid()
  S().patch((x) => {
    x.plans.push({
      id,
      name: 'Einzelne Einheiten',
      templateId: 'frei',
      createdAt: today(),
      status: 'active',
      basis: [],
      config: { sport: 'run', goal: 'fitness', level: 1, weeks: 520, startDate: startOfWeek(today(), x.profile.weekStart), sessionsPerWeek: 0, days: [], startVolume: 0, rampPct: 0, deloadEvery: 4, focus: 'mixed', terrain: 'flat', single: true },
    })
  })
  return id
}

function freeze(d: AppData, s: Session) {
  const refs = refsFromProfile(d.profile, s.date)
  s.frozen = { date: today(), steps: s.steps.map((st) => ({ ...st, text: renderText(st.text, refs) })) }
}

export interface ManualLog {
  durationMin: number
  distanceKm?: number
  rpe?: number
  avgHr?: number
  sets?: LoggedSet[]
  note?: string
}

export function manualActivity(d: AppData, s: Pick<Session, 'discipline' | 'date'>, log: ManualLog, sessionId?: string): Activity {
  const p = d.profile
  const dur = Math.round(log.durationMin * 60)
  const hrMax = effectiveHrMax(p)?.value
  const rest = p.hrRest ?? 60
  const lthr = p.lthr ?? (hrMax ? Math.round(rest + 0.85 * (hrMax - rest)) : undefined)
  let load = (dur / 3600) * 0.65 * 0.65 * 100
  let loadSource: Activity['loadSource'] = 'duration'
  if (log.avgHr && hrMax && lthr) {
    load = tssHr(dur, log.avgHr, rest, hrMax, lthr, p.sex === 'f')
    loadSource = 'hr'
  } else if (log.rpe) {
    load = tssRpe(dur, log.rpe)
    loadSource = 'rpe'
  }
  return {
    id: uid(),
    source: 'manual',
    discipline: s.discipline,
    start: `${s.date}T12:00:00`,
    date: s.date,
    durationSec: dur,
    distanceM: log.distanceKm ? Math.round(log.distanceKm * 1000) : undefined,
    avgHr: log.avgHr,
    rpe: log.rpe,
    load: Math.round(load),
    loadSource,
    sets: log.sets,
    note: log.note,
    sessionId,
  }
}

/** Einheit abhaken, optional mit eigenen Angaben */
export function completeSession(id: string, log?: ManualLog) {
  S().change((d) => {
    const s = d.sessions.find((x) => x.id === id)
    if (!s) return
    s.status = 'done'
    freeze(d, s)
    if (log) {
      const a = manualActivity(d, s, log, s.id)
      d.activities.push(a)
      s.activityId = a.id
    } else if (!s.activityId) {
      // ohne Angaben zählt der geplante Umfang
      const a = manualActivity(d, s, { durationMin: s.durationMin, distanceKm: s.distanceKm }, s.id)
      a.load = s.load
      a.note = 'Wie geplant abgehakt'
      d.activities.push(a)
      s.activityId = a.id
    }
  }, 'Einheit erledigt')
}

export function reopenSession(id: string) {
  S().change((d) => {
    const s = d.sessions.find((x) => x.id === id)
    if (!s) return
    const a = d.activities.find((x) => x.id === s.activityId)
    if (a?.source === 'manual') d.activities = d.activities.filter((x) => x.id !== a.id)
    else if (a) a.sessionId = undefined
    s.status = 'planned'
    s.activityId = undefined
    s.frozen = undefined
  }, 'Einheit wieder offen')
}

export function logFreeActivity(discipline: Session['discipline'], date: string, log: ManualLog) {
  S().change((d) => {
    d.activities.push(manualActivity(d, { discipline, date }, log))
  }, 'Einheit eingetragen')
}

export function chooseAlternative(sessionId: string, alt: Alternative, symptoms: string[], reason: string) {
  S().change((d) => {
    const i = d.sessions.findIndex((x) => x.id === sessionId)
    if (i < 0) return
    d.sessions[i] = applyAlternative(d.sessions[i], alt, reason, today())
    d.readiness.push({ date: today(), sessionId, symptoms, choice: alt.id })
  }, alt.id === 'rest' ? 'Ruhetag eingetragen' : 'Einheit angepasst')
}

// ---------- Import ----------

export interface ImportItem {
  raw: RawActivity
  activity: Activity
  duplicate: boolean
  matchId?: string
  confidence?: 'sicher' | 'möglich'
}

export function prepareImport(data: AppData, raws: RawActivity[]): ImportItem[] {
  const items: ImportItem[] = []
  const pool = [...data.activities]
  const taken = new Set<string>()
  for (const raw of raws) {
    const activity = summarizeActivity(raw, data.profile, uid())
    const duplicate = isDuplicate(activity, pool)
    const m = duplicate ? undefined : matchSession(activity, data.sessions.filter((s) => !taken.has(s.id) && data.plans.find((p) => p.id === s.planId)?.status !== 'ended'))
    if (m) taken.add(m.sessionId)
    if (!duplicate) pool.push(activity)
    items.push({ raw, activity, duplicate, matchId: m?.sessionId, confidence: m?.confidence })
  }
  return items
}

export function commitImport(items: { activity: Activity; matchId?: string }[]) {
  if (!items.length) return
  S().change((d) => {
    for (const it of items) {
      const a = { ...it.activity }
      const s = it.matchId ? d.sessions.find((x) => x.id === it.matchId) : undefined
      if (s) {
        const old = d.activities.find((x) => x.id === s.activityId)
        if (old?.source === 'manual') d.activities = d.activities.filter((x) => x.id !== old.id)
        a.sessionId = s.id
        s.activityId = a.id
        s.status = 'done'
        freeze(d, s)
      }
      d.activities.push(a)
    }
  }, `${items.length} ${items.length === 1 ? 'Einheit' : 'Einheiten'} importiert`)
}

export function deleteActivity(id: string) {
  S().change((d) => {
    d.activities = d.activities.filter((a) => a.id !== id)
    d.sessions.forEach((s) => {
      if (s.activityId === id) {
        s.activityId = undefined
        s.status = 'planned'
        s.frozen = undefined
      }
    })
  }, 'Aufzeichnung gelöscht')
}

// ---------- Erholung ----------

export function saveRecovery(entry: RecoveryEntry) {
  S().change((d) => {
    d.recovery = [...d.recovery.filter((e) => e.week !== entry.week), entry].sort((a, b) => a.week.localeCompare(b.week))
  }, 'Erholungsdaten gespeichert')
}

export function importRecoveryDays(days: { date: string; hrv?: number; rhr?: number; sleepH?: number }[]): number {
  const weeks = weeklyFromDays(days, S().data.profile.weekStart)
  S().change((d) => {
    for (const w of weeks) {
      const old = d.recovery.find((e) => e.week === w.week)
      const merged: RecoveryEntry = { ...old, ...w, feeling: old?.feeling, soreness: old?.soreness, hrv: w.hrv ?? old?.hrv, rhr: w.rhr ?? old?.rhr, sleepH: w.sleepH ?? old?.sleepH }
      d.recovery = [...d.recovery.filter((e) => e.week !== w.week), merged]
    }
    d.recovery.sort((a, b) => a.week.localeCompare(b.week))
  }, `Erholungsdaten für ${weeks.length} ${weeks.length === 1 ? 'Woche' : 'Wochen'} importiert`)
  return weeks.length
}

/** Entlastungswoche vorziehen: die nächste Entlastung des Plans rückt in die angegebene Woche */
export function pullDeloadForward(data: AppData, planId: string, weekStartIso: string): PlanConfig | undefined {
  const plan = data.plans.find((p) => p.id === planId)
  if (!plan) return undefined
  const weeks = planWeeks(plan.config)
  const target = weeks.find((w) => w.start === weekStartIso)
  const next = weeks.find((w) => w.deload && w.start > weekStartIso)
  if (!target || !next || target.taper) return undefined
  const current = deloadWeeks(plan.config)
  return { ...plan.config, deloadWeeks: current.map((i) => (i === next.index ? target.index : i)).sort((a, b) => a - b), deloadMoves: undefined }
}

// ---------- Profil ----------

export function updateProfile(fn: (p: Profile) => void, message?: string) {
  if (message) S().change((d) => fn(d.profile), message)
  else S().patch((d) => fn(d.profile))
}

export function seenTerm(id: string) {
  if (S().data.profile.seenTerms.includes(id)) return
  S().patch((d) => d.profile.seenTerms.push(id))
}

export function dismiss(id: string) {
  S().patch((d) => {
    if (!d.dismissed.includes(id)) d.dismissed.push(id)
  })
}

export { addDays }
