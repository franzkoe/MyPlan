import { describe, expect, test } from 'vitest'
import { addDays } from '../src/logic/dates'
import { buildCtx, generatePlan } from '../src/logic/generator'
import { applyAlternative, evaluateRecovery, notRecovered, overuse, recoveryDue, recoverySuggestions, weeklyFromDays } from '../src/logic/recovery'
import { templateConfig } from '../src/logic/templates'
import type { RecoveryEntry } from '../src/logic/types'

const W = (i: number) => addDays('2026-09-07', i * 7)
const entries = (hrv: number[], rhr: number[]): RecoveryEntry[] => hrv.map((h, i) => ({ week: W(i), hrv: h, rhr: rhr[i], source: 'user' as const }))

describe('persönlicher Normalbereich', () => {
  test('in den ersten Wochen wird nur gesammelt', () => {
    const e = evaluateRecovery(entries([60, 62, 58], [48, 49, 47]), W(2))
    expect(e.status).toBe('collecting')
    expect(e.weeksNeeded).toBe(2)
    expect(e.detail).toContain('4 Wochen')
  })
  test('Werte im Bereich: normal', () => {
    const e = evaluateRecovery(entries([60, 62, 58, 61, 60], [48, 49, 47, 48, 48]), W(4))
    expect(e.status).toBe('normal')
    expect(e.hrv!.mean).toBeGreaterThan(59)
    expect(e.hrv!.mean).toBeLessThan(61)
    expect(e.hrv!.lo).toBeLessThan(60)
    expect(e.rhr!.hi).toBe(50)
  })
  test('HRV deutlich gedrückt und Ruhepuls erhöht: Vorschläge', () => {
    const e = evaluateRecovery(entries([60, 62, 58, 61, 48], [48, 49, 47, 48, 54]), W(4))
    expect(e.status).toBe('low')
    const cfg = templateConfig('run', '10k', 2, { startDate: W(4) })
    const week = generatePlan('p', cfg, buildCtx(2)).filter((s) => s.weekIndex === 1)
    const sug = recoverySuggestions(e, week, addDays(W(4), 7), addDays(W(4), 6), 2)
    expect(sug.some((s) => s.type === 'deload')).toBe(true)
    expect(sug.filter((s) => s.type === 'ease').length).toBe(week.filter((s) => s.hard).length)
    expect(sug.every((s) => s.reason.length > 10)).toBe(true)
  })
  test('nur ein Wert außerhalb: beobachten, keine Planänderung', () => {
    const e = evaluateRecovery(entries([60, 62, 58, 61, 48], [48, 49, 47, 48, 48]), W(4))
    expect(e.status).toBe('watch')
    expect(recoverySuggestions(e, [], W(5), W(5))).toEqual([])
  })
  test('gut erholt', () => {
    expect(evaluateRecovery(entries([60, 62, 58, 61, 70], [48, 49, 47, 48, 46]), W(4)).status).toBe('good')
  })
  test('Vergleich mit dem eigenen Bereich, nicht mit Normwerten', () => {
    // 30 ms ist für diese Person normal
    expect(evaluateRecovery(entries([30, 31, 29, 30, 30], [60, 61, 59, 60, 60]), W(4)).status).toBe('normal')
  })
  test('Tageswerte werden zu Wochen gemittelt', () => {
    const w = weeklyFromDays([
      { date: '2026-10-05', hrv: 60, rhr: 48 },
      { date: '2026-10-06', hrv: 64, rhr: 50 },
      { date: '2026-10-12', hrv: 50 },
    ])
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ week: '2026-10-05', hrv: 62, rhr: 49 })
  })
  test('Fälligkeit der wöchentlichen Eingabe', () => {
    expect(recoveryDue([], '2026-11-21', 6)).toBe(false) // Samstag, Erinnerung am Sonntag
    expect(recoveryDue([], '2026-11-22', 6)).toBe(true)
    expect(recoveryDue([{ week: '2026-11-16', hrv: 60, source: 'user' }], '2026-11-22', 6)).toBe(false)
  })
})

describe('Nicht gut erholt', () => {
  const cfg = templateConfig('run', '10k', 2, { startDate: '2026-11-16' })
  const ctx = buildCtx(2)
  const week = generatePlan('p', cfg, ctx).filter((s) => s.weekIndex === 0)
  const hard = week.find((s) => s.hard)!
  const input = { session: hard, week, weekStart: '2026-11-16', today: hard.date, ctx }

  test('vier Alternativen, jede mit Begründung, genau eine empfohlen', () => {
    const r = notRecovered({ ...input, symptoms: ['tired'] })
    expect(r.alternatives.map((a) => a.id).sort()).toEqual(['ease', 'move', 'replace', 'rest'])
    expect(r.alternatives.filter((a) => a.recommended)).toHaveLength(1)
    expect(r.alternatives.every((a) => a.reason.length > 20)).toBe(true)
    const ease = r.alternatives.find((a) => a.id === 'ease')!
    expect(ease.built!.durationMin).toBeLessThan(hard.durationMin)
    expect(ease.built!.load).toBeLessThan(hard.load)
    const move = r.alternatives.find((a) => a.id === 'move')!
    expect(move.moveTo! > hard.date).toBe(true)
    expect(move.consequence).toBeDefined()
  })
  test('Fieber: klare Empfehlung zur Pause, keine Trainingsalternative', () => {
    const r = notRecovered({ ...input, symptoms: ['fever'] })
    expect(r.illness).toBe(true)
    expect(r.alternatives.map((a) => a.id)).toEqual(['rest'])
    expect(r.note).toContain('kein Training')
  })
  test('angeschlagen vor harter Einheit: Ruhetag empfohlen', () => {
    const r = notRecovered({ ...input, symptoms: ['sick'] })
    expect(r.alternatives[0]).toMatchObject({ id: 'rest', recommended: true })
  })
  test('viele Zeichen plus gedrückte Wochenauswertung: nicht die harte Version', () => {
    const lastEval = evaluateRecovery(entries([60, 62, 58, 61, 48], [48, 49, 47, 48, 54]), W(4))
    const r = notRecovered({ ...input, symptoms: ['tired', 'legs'], lastEval, hrvToday: 45 })
    expect(['move', 'replace', 'rest']).toContain(r.alternatives[0].id)
    expect(r.note).toContain('Wochenauswertung')
    expect(r.note).toContain('HRV von heute')
  })
  test('gewählte Alternative bleibt an der Einheit erkennbar', () => {
    const r = notRecovered({ ...input, symptoms: ['legs'] })
    const eased = applyAlternative(hard, r.alternatives.find((a) => a.id === 'ease')!, 'Schwere Beine', hard.date)
    expect(eased.adjusted).toMatchObject({ type: 'eased', originalTitle: hard.title, reason: 'Schwere Beine' })
    expect(eased.id).toBe(hard.id)
    expect(eased.key).toBe(hard.key)
    const moved = applyAlternative(hard, r.alternatives.find((a) => a.id === 'move')!, 'x', hard.date)
    expect(moved.adjusted!.originalDate).toBe(hard.date)
    expect(applyAlternative(hard, r.alternatives.find((a) => a.id === 'rest')!, 'x', hard.date).status).toBe('skipped')
  })
  test('Krafteinheit: weniger Sätze und weniger Last', () => {
    const g = generatePlan('g', templateConfig('gym', 'hypertrophy', 1, { startDate: '2026-11-16' }), ctx).filter((s) => s.weekIndex === 0)
    const r = notRecovered({ ...input, session: g[0], week: g, symptoms: ['sore'] })
    const ease = r.alternatives.find((a) => a.id === 'ease')!
    const sets = (x: { gym?: { sets: number }[] }) => x.gym!.reduce((a, s) => a + s.sets, 0)
    expect(sets(ease.built!)).toBeLessThan(sets(g[0]))
    expect(Math.max(...ease.built!.gym!.map((s) => s.pct1rm ?? 0))).toBeLessThan(Math.max(...g[0].gym!.map((s) => s.pct1rm ?? 0)))
  })
  test('auffällig häufige Nutzung', () => {
    const logs = [1, 5, 9, 20].map((d) => ({ date: addDays('2026-11-01', d), sessionId: 's', symptoms: [], choice: 'ease' }))
    expect(overuse(logs, '2026-11-25').flag).toBe(true)
    expect(overuse(logs.slice(0, 2), '2026-11-25').flag).toBe(false)
  })
})
