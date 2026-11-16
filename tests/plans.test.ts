import { describe, expect, test } from 'vitest'
import { addDays, weekday } from '../src/logic/dates'
import { buildCtx, deloadWeeks, generatePlan, planWeeks } from '../src/logic/generator'
import { alignWithPlans, experience, moveDeload, proposeResume, recalcPlan, weekConflicts } from '../src/logic/plans'
import { templateConfig } from '../src/logic/templates'
import type { Plan, Session } from '../src/logic/types'

const START = '2026-11-16'
const ctx = buildCtx(1)
const mkPlan = (id: string, cfg = templateConfig('run', '10k', 1, { startDate: START })): Plan => ({ id, name: id, config: cfg, createdAt: START, status: 'active', basis: [] })

describe('Neuberechnung offener Wochen', () => {
  const plan = mkPlan('p')
  const base = generatePlan('p', plan.config, ctx)
  const today = addDays(START, 16) // Mittwoch der dritten Woche

  test('erledigte Einheiten, die laufende Woche und Handänderungen bleiben', () => {
    const old = base.map((s) => ({ ...s }))
    old.filter((s) => s.date < today).forEach((s) => (s.status = 'done'))
    const manual = old.find((s) => s.weekIndex === 5)!
    manual.manual = true
    manual.title = 'Eigene Einheit'
    const cfg = { ...plan.config, sessionsPerWeek: 3, days: [1, 3, 6] }
    const r = recalcPlan(plan, old, cfg, ctx, today)
    expect(r.from).toBe(addDays(START, 21))
    // Vergangenheit und laufende Woche unverändert
    expect(r.sessions.filter((s) => s.date < r.from)).toEqual(old.filter((s) => s.date < r.from))
    // offene Wochen haben jetzt drei Einheiten (Woche 5 behält zusätzlich die Handänderung)
    expect(r.sessions.filter((s) => s.weekIndex === 4)).toHaveLength(3)
    expect(r.sessions.some((s) => s.title === 'Eigene Einheit')).toBe(true)
    expect(r.keptManual).toBe(1)
    expect(r.changes.length).toBeGreaterThan(0)
    expect(r.changes.every((c) => c.start >= r.from)).toBe(true)
    // ausdrücklich freigegeben: Handänderung wird ersetzt
    const r2 = recalcPlan(plan, old, cfg, ctx, today, 0, true)
    expect(r2.sessions.some((s) => s.title === 'Eigene Einheit')).toBe(false)
  })
  test('ohne Änderung gibt es keine Unterschiede', () => {
    expect(recalcPlan(plan, base, plan.config, ctx, today).changes).toEqual([])
  })
  test('verkürzen entfernt nur offene Wochen', () => {
    const r = recalcPlan(plan, base, { ...plan.config, weeks: 8 }, ctx, today)
    expect(Math.max(...r.sessions.map((s) => s.weekIndex))).toBe(7)
  })
})

describe('Pause und Wiedereinstieg', () => {
  test('zwei Wochen Pause: Plan verschiebt sich, Einstieg mit reduziertem Umfang', () => {
    const plan = { ...mkPlan('p'), status: 'paused' as const, pausedAt: addDays(START, 8) }
    const r = proposeResume(plan, addDays(START, 23))
    expect(r.daysPaused).toBe(15)
    expect(r.shiftWeeks).toBe(2)
    expect(r.factors).toEqual([0.5, 0.7, 0.85])
    const before = planWeeks(plan.config)
    const after = planWeeks(r.cfg)
    expect(after[1].start).toBe(addDays(before[1].start, 14))
    expect(after[1].volume).toBeCloseTo(before[1].volume * 0.5)
    expect(after[2].volume).toBeCloseTo(before[2].volume * 0.7)
    expect(after[4].volume).toBeCloseTo(before[4].volume)
    expect(r.text).toContain('reduziertem Umfang')
  })
  test('mit Zieldatum bleibt das Datum, die Wochen entfallen', () => {
    const cfg = templateConfig('run', 'half', 1, { startDate: START, raceDate: '2027-03-07' })
    const plan = { ...mkPlan('p', cfg), status: 'paused' as const, pausedAt: addDays(cfg.startDate, 15) }
    const r = proposeResume(plan, addDays(cfg.startDate, 30))
    expect(r.shiftWeeks).toBe(0)
    expect(planWeeks(r.cfg)[cfg.weeks - 1].start).toBe(planWeeks(cfg)[cfg.weeks - 1].start)
    expect(r.cfg.weekFactors![4]).toBe(0.5)
  })
  test('ab vier Wochen: Hinweis auf neuen Plan', () => {
    const plan = { ...mkPlan('p'), status: 'paused' as const, pausedAt: START }
    expect(proposeResume(plan, addDays(START, 30)).restart).toBe(true)
  })
})

describe('Entlastungswochen verschieben', () => {
  const cfg = mkPlan('p').config
  test('um eine Woche möglich', () => {
    const r = moveDeload(cfg, 3, 4)
    expect(deloadWeeks(r.cfg!)).toEqual([4, 7, 11])
  })
  test('nicht so weit, dass mehr als vier Aufbauwochen entstehen', () => {
    expect(moveDeload(cfg, 3, 6).error).toContain('vier Aufbauwochen')
    expect(moveDeload(cfg, 3, 7).error).toBeDefined()
  })
})

describe('Pläne kombinieren', () => {
  test('neuer Plan bekommt dieselben Entlastungswochen und meidet harte Tage', () => {
    const run = mkPlan('run')
    const runSessions = generatePlan('run', run.config, ctx)
    // Kraftplan startet zwei Wochen später
    const gymCfg = templateConfig('gym', 'endurance', 1, { startDate: addDays(START, 14) })
    const aligned = alignWithPlans(gymCfg, [{ plan: run, sessions: runSessions }])
    const runDeloads = planWeeks(run.config).filter((w) => w.deload).map((w) => w.start)
    const gymDeloads = planWeeks(aligned).filter((w) => w.deload).map((w) => w.start)
    for (const d of gymDeloads.filter((d) => d <= runDeloads[runDeloads.length - 1])) expect(runDeloads).toContain(d)
    expect(gymDeloads.length).toBeGreaterThanOrEqual(2)
    const hardDays = new Set(runSessions.filter((s) => s.hard || s.kind === 'long').map((s) => weekday(s.date)))
    const gym = generatePlan('gym', aligned, ctx)
    for (const s of gym) expect(hardDays.has(weekday(s.date))).toBe(false)
    // schweres Beintraining nie am Tag vor Intervallen oder dem langen Lauf
    for (const g of gym.filter((s) => s.heavyLegs)) expect(runSessions.some((r) => (r.hard || r.kind === 'long') && r.date === addDays(g.date, 1))).toBe(false)
  })

  const S = (o: Partial<Session>): Session => ({ id: 'x', planId: 'a', weekIndex: 0, date: START, discipline: 'run', kind: 'easy', title: 'T', steps: [], durationMin: 60, load: 50, hard: false, key: false, deload: false, status: 'planned', ...o })
  const plans = [mkPlan('a'), mkPlan('b', templateConfig('gym', 'endurance', 1, { startDate: START }))]

  test('harte Einheiten an aufeinanderfolgenden Tagen: Vorschlag mit Begründung', () => {
    const week = [S({ id: '1', date: addDays(START, 1), hard: true, kind: 'intervals', title: 'Intervalle', key: true }), S({ id: '2', date: addDays(START, 2), hard: true, kind: 'threshold', title: 'Schwelle' }), S({ id: '3', date: addDays(START, 6), kind: 'long', title: 'Lang' })]
    const c = weekConflicts(week, START, plans, 'a', undefined, START)
    const hit = c.find((x) => x.rule === 'hardConsecutive')!
    expect(hit.sessionId).toBe('2')
    expect(hit.moveTo).toBe(addDays(START, 3))
    expect(hit.reason).toContain('Donnerstag')
  })
  test('schweres Beintraining vor dem langen Lauf', () => {
    const week = [S({ id: 'g', planId: 'b', date: addDays(START, 5), discipline: 'gym', kind: 'strength', heavyLegs: true, title: 'Unterkörper' }), S({ id: 'l', date: addDays(START, 6), kind: 'long', title: 'Langer Lauf', key: true })]
    const c = weekConflicts(week, START, plans, 'a', undefined, START)
    const hit = c.find((x) => x.rule === 'legsBeforeHard')!
    expect(hit.sessionId).toBe('g')
    expect(hit.moveTo).toBeDefined()
    expect(hit.moveTo).not.toBe(addDays(START, 5))
  })
  test('Kraft und Ausdauer am selben Tag: die für das Hauptziel wichtigere zuerst', () => {
    const week = [S({ id: 'g', planId: 'b', date: START, discipline: 'gym', kind: 'strength', title: 'Kraft' }), S({ id: 'r', date: START, title: 'Dauerlauf' })]
    const hit = weekConflicts(week, START, plans, 'a', undefined, START).find((x) => x.rule === 'sameDay')!
    expect(hit.reason).toContain('Zuerst „Dauerlauf“')
    expect(weekConflicts(week, START, plans, 'b', undefined, START).find((x) => x.rule === 'sameDay')!.reason).toContain('Zuerst „Kraft“')
  })
  test('kein Ruhetag, Belastungssprung, ungleiche Entlastung', () => {
    const week = Array.from({ length: 7 }, (_, i) => S({ id: `d${i}`, date: addDays(START, i), load: 80, key: i === 6, deload: false }))
    week.push(S({ id: 'gd', planId: 'b', date: START, discipline: 'gym', kind: 'strength', deload: true }))
    const c = weekConflicts(week, START, plans, 'a', 300, START)
    expect(c.find((x) => x.rule === 'noRestDay')!.action).toBe('skip')
    expect(c.some((x) => x.rule === 'loadJump')).toBe(true)
    expect(c.find((x) => x.rule === 'deloadMismatch')!.action).toBe('alignDeload')
  })
  test('eine saubere Woche hat keine Konflikte', () => {
    const run = mkPlan('a')
    const week = generatePlan('a', run.config, ctx).filter((s) => s.weekIndex === 1)
    expect(weekConflicts(week, addDays(START, 7), [run], 'a', undefined, START)).toEqual([])
  })
})

describe('Erfahrungen aus einem Plan für den Folgeplan', () => {
  test('Startumfang aus den Ist-Werten, nicht aus dem Soll', () => {
    const plan = mkPlan('p')
    const sessions = generatePlan('p', plan.config, ctx)
    // vier Wochen: jeweils die letzte Einheit ausgelassen
    for (let w = 0; w < 4; w++) {
      const ss = sessions.filter((s) => s.weekIndex === w)
      ss.forEach((s, i) => (s.status = i < ss.length - 1 ? 'done' : 'skipped'))
    }
    const e = experience(plan, sessions, [], addDays(START, 28))
    expect(e.weeksDone).toBe(4)
    expect(e.done).toBe(12)
    expect(e.compliance).toBeCloseTo(0.75)
    expect(e.recentActual).toBeLessThan(plan.config.startVolume * 1.05)
    expect(e.suggestion.startVolume).toBeCloseTo(e.recentActual, 1)
    expect(e.weekly[0].actual).toBeLessThan(e.weekly[0].planned)
  })
})
