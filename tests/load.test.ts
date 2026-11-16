import { describe, expect, test } from 'vitest'
import { formCurve, normalizedPower, plannedLoad, tssHr, tssPace, tssPower, tssRpe } from '../src/logic/load'

describe('Trainingsbelastung', () => {
  test('eine Stunde an der FTP ergibt 100', () => {
    expect(tssPower(3600, 250, 250)).toBeCloseTo(100)
    expect(tssPower(7200, 187.5, 250)).toBeCloseTo(112.5)
  })
  test('Normalized Power: gleichmäßig = Durchschnitt, wechselhaft liegt darüber', () => {
    expect(normalizedPower(new Array(600).fill(200))).toBeCloseTo(200)
    const varied = Array.from({ length: 1200 }, (_, i) => (Math.floor(i / 120) % 2 ? 300 : 100))
    expect(normalizedPower(varied)).toBeGreaterThan(200)
    expect(normalizedPower(varied)).toBeLessThan(300)
  })
  test('eine Stunde am Schwellenpuls ergibt 100, lockerer deutlich weniger', () => {
    expect(tssHr(3600, 170, 50, 190, 170)).toBeCloseTo(100)
    const easy = tssHr(3600, 130, 50, 190, 170)
    expect(easy).toBeGreaterThan(25)
    expect(easy).toBeLessThan(60)
  })
  test('Tempo und Anstrengung', () => {
    expect(tssPace(3600, 255, 255)).toBeCloseTo(100)
    expect(tssPace(3600, 340, 255)).toBeCloseTo(56.25)
    expect(tssRpe(3600, 10)).toBeCloseTo(100)
    expect(plannedLoad('easy', 60)).toBe(42)
  })
  test('Fitness, Ermüdung und Form', () => {
    const daily = Array.from({ length: 200 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), load: 60 }))
    const c = formCurve(daily)
    const last = c[c.length - 1]
    // bei konstanter Belastung nähern sich beide Werte der Tagesbelastung, die Form geht gegen 0
    expect(last.ctl).toBeGreaterThan(59)
    expect(last.atl).toBeCloseTo(60, 1)
    expect(Math.abs(last.tsb)).toBeLessThan(1)
    // erster Tag: CTL = 60/42, ATL = 60/7
    expect(c[0].ctl).toBeCloseTo(60 / 42)
    expect(c[0].atl).toBeCloseTo(60 / 7)
    expect(c[1].tsb).toBeCloseTo(60 / 42 - 60 / 7)
  })
  test('Ruhetage lassen die Ermüdung schneller fallen als die Fitness', () => {
    const daily = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), load: 80 }))
    const c = formCurve(daily, '2026-03-11')
    const last = c[c.length - 1]
    expect(last.tsb).toBeGreaterThan(0)
    expect(last.atl).toBeLessThan(last.ctl)
  })
})
