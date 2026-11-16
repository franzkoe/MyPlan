import { describe, expect, test } from 'vitest'
import { compliance, driftTrend, formSentence, form, ftpEstimate, headline, paceAtSameHr, powerAtSameHr, powerBests, racePrediction, runBests, strengthFindings, testsDue, valueTrend, weeklySetsByMuscle, zoneDistribution } from '../src/logic/analysis'
import { addDays } from '../src/logic/dates'
import { emptyProfile, type Activity, type Session } from '../src/logic/types'

const TODAY = '2026-11-16'
const A = (o: Partial<Activity>): Activity => ({ id: Math.random().toString(36).slice(2), source: 'manual', discipline: 'run', start: `${o.date}T07:00:00.000Z`, date: TODAY, durationSec: 3000, load: 50, loadSource: 'hr', ...o })
const run = (daysAgo: number, pace: number, hr: number) => A({ date: addDays(TODAY, -daysAgo), distanceM: 10000, durationSec: pace * 10, avgHr: hr })

describe('Tempo bei gleichem Puls', () => {
  test('zu wenig Daten wird benannt, kein Trend behauptet', () => {
    const f = paceAtSameHr([run(2, 330, 140), run(40, 340, 140)], TODAY)
    expect(f.trend).toBe('nodata')
    expect(f.sentence).toContain('Zu wenig Daten')
  })
  test('Fortschritt', () => {
    const f = paceAtSameHr([run(2, 330, 141), run(9, 332, 139), run(40, 340, 140), run(47, 338, 141), run(54, 341, 140)], TODAY)
    expect(f.trend).toBe('better')
    expect(f.sentence).toBe('Tempo bei gleichem Puls: 9 s/km schneller als vor 6 Wochen')
    expect(f.activityIds).toHaveLength(5)
  })
  test('Rückschritt und Stagnation werden genauso klar benannt', () => {
    expect(paceAtSameHr([run(2, 350, 141), run(9, 352, 139), run(40, 340, 140), run(47, 338, 141)], TODAY).sentence).toContain('langsamer')
    const same = paceAtSameHr([run(2, 340, 141), run(9, 341, 139), run(40, 340, 140), run(47, 339, 141)], TODAY)
    expect(same.trend).toBe('same')
    expect(same.sentence).toContain('unverändert')
  })
  test('nur vergleichbare Einheiten: Läufe mit deutlich anderem Puls zählen nicht', () => {
    // die schnellen Läufe bei Puls 165 dürfen den Vergleich nicht verfälschen
    const f = paceAtSameHr([run(2, 340, 141), run(9, 341, 139), run(5, 270, 165), run(40, 340, 140), run(47, 339, 141), run(44, 280, 166)], TODAY)
    expect(f.trend).toBe('same')
  })
})

describe('weitere Kennzahlen', () => {
  test('Pulsdrift', () => {
    const long = (d: number, drift: number) => A({ date: addDays(TODAY, -d), durationSec: 6000, driftPct: drift })
    expect(driftTrend([long(3, 3)], 'run').trend).toBe('nodata')
    const f = driftTrend([long(50, 8), long(40, 7.5), long(30, 7), long(10, 4), long(3, 3.6)], 'run')
    expect(f.trend).toBe('better')
    expect(f.sentence).toContain('gesunken')
  })
  test('Bestzeiten und Wettkampfprognose', () => {
    const acts = [A({ date: '2026-10-01', bestEfforts: [{ key: 5000, value: 1500 }] }), A({ date: '2026-11-01', bestEfforts: [{ key: 5000, value: 1450 }, { key: 10000, value: 3000 }] })]
    const b = runBests(acts, TODAY)
    expect(b.map((x) => [x.label, x.value, x.date])).toEqual([
      ['5 km', 1450, '2026-11-01'],
      ['10 km', 3000, '2026-11-01'],
    ])
    const p = emptyProfile()
    expect(racePrediction(p, TODAY)).toBeUndefined()
    p.vo2max = [{ date: '2026-11-01', value: 50, sport: 'run', source: 'watch' }]
    const pred = racePrediction(p, TODAY)!
    expect(pred.estimate).toBe(true)
    expect(pred.rows[0].time).toMatch(/^19:5[67]$/)
    p.raceResults = [{ date: '2026-10-20', distanceM: 10000, timeSec: 2700 }]
    expect(racePrediction(p, TODAY)!.rows[1].time).toBe('45:00')
  })
  test('Rad: Leistung bei gleichem Puls, Bestleistungen, FTP-Schätzung', () => {
    const ride = (d: number, np: number, pb?: number) => A({ discipline: 'bike', date: addDays(TODAY, -d), durationSec: 5400, avgHr: 135, np, powerBests: pb ? [{ key: 1200, value: pb }] : undefined })
    const acts = [ride(2, 200, 262), ride(8, 198), ride(35, 185), ride(45, 187, 240)]
    const f = powerAtSameHr(acts, TODAY)
    expect(f.trend).toBe('better')
    expect(f.sentence).toBe('Leistung bei gleichem Puls: 13 W mehr als vor 6 Wochen')
    expect(powerBests(acts, TODAY)[0]).toMatchObject({ key: 1200, value: 262 })
    expect(powerBests(acts, TODAY, 42, 42)[0].value).toBe(240)
    expect(ftpEstimate(acts, TODAY)!.value).toBe(249)
  })
  test('Verlauf eines Werts', () => {
    const f = valueTrend('ftp', 'FTP', [{ date: '2026-09-01', value: 240 }, { date: '2026-11-01', value: 252 }], 'W', false, (v) => `${v} W`, 3)
    expect(f.trend).toBe('better')
    expect(f.sentence).toBe('FTP: von 240 W auf 252 W in 9 Wochen')
    expect(valueTrend('css', 'CSS', [{ date: '2026-09-01', value: 105 }, { date: '2026-11-01', value: 108 }], '', true, (v) => `${v}`, 1).trend).toBe('worse')
    expect(valueTrend('x', 'CSS', [], '', true, String, 1).sentence).toContain('Noch kein Wert')
  })
  test('Kraft: geschätztes 1RM und Sätze pro Muskelgruppe', () => {
    const g = (d: number, kg: number, reps: number) => A({ discipline: 'gym', date: addDays(TODAY, -d), sets: [{ exerciseId: 'squat', kg, reps }, { exerciseId: 'squat', kg, reps }, { exerciseId: 'bench', kg: 60, reps: 8 }] })
    const f = strengthFindings([g(3, 100, 5), g(40, 90, 5)], TODAY).find((x) => x.id === 'gym-squat')!
    expect(f.trend).toBe('better')
    expect(f.sentence).toBe('Kniebeuge: geschätztes 1RM gestiegen von 105 auf 117 kg')
    const sets = weeklySetsByMuscle([g(3, 100, 5)], addDays(TODAY, -6))
    expect(sets.find((s) => s.muscle === 'Beine vorn')!.sets).toBe(2)
    expect(sets.find((s) => s.muscle === 'Brust')!.sets).toBe(1)
    expect(headline('gym', [], emptyProfile(), TODAY).trend).toBe('nodata')
  })
})

describe('Plan-Fortschritt', () => {
  test('Erfüllungsquote', () => {
    const S = (date: string, status: Session['status']): Session => ({ id: date, planId: 'p', weekIndex: 0, date, discipline: 'run', kind: 'easy', title: '', steps: [], durationMin: 30, load: 20, hard: false, key: false, deload: false, status })
    const c = compliance([S('2026-11-10', 'done'), S('2026-11-11', 'skipped'), S('2026-11-12', 'planned'), S('2026-11-13', 'done'), S('2026-11-20', 'planned')], TODAY)
    expect(c).toEqual({ due: 4, done: 2, skipped: 1, rate: 0.5 })
  })
  test('Zonenverteilung gegen die Vorgabe', () => {
    const z = zoneDistribution([A({ date: '2026-11-10', hrZoneSec: [600, 2400, 300, 300, 0] }), A({ date: '2026-11-12', hrZoneSec: [0, 3000, 0, 600, 0] })], '2026-11-09', '2026-11-15')!
    expect(z.easyShare).toBeCloseTo(6000 / 7200)
    expect(z.sentence).toContain('83 %')
    const hard = zoneDistribution([A({ date: '2026-11-10', hrZoneSec: [0, 1800, 2400, 600, 0] })], '2026-11-09', '2026-11-15')!
    expect(hard.sentence).toContain('Nur 38 %')
    expect(zoneDistribution([], '2026-11-09', '2026-11-15')).toBeUndefined()
  })
  test('Fitness und Form: erst ab vier Wochen eine Aussage', () => {
    const acts = Array.from({ length: 10 }, (_, i) => A({ date: addDays(TODAY, -i), load: 60 }))
    expect(formSentence(form(acts, TODAY)).trend).toBe('nodata')
    const more = Array.from({ length: 70 }, (_, i) => A({ date: addDays(TODAY, -i), load: i < 28 ? 80 : 40 }))
    const f = formSentence(form(more, TODAY))
    expect(f.trend).toBe('better')
    expect(f.sentence).toContain('gestiegen')
  })
  test('Vorschlag für einen neuen Leistungstest', () => {
    const p = { ...emptyProfile(), sports: ['run', 'bike'] as ('run' | 'bike')[] }
    p.ftp = [{ date: '2026-08-01', value: 240 }]
    p.thresholdPace = [{ date: '2026-11-01', value: 260 }]
    const due = testsDue(p, TODAY)
    expect(due.map((d) => d.builder)).toEqual(['bike.test'])
  })
})
