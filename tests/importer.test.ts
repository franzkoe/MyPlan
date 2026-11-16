import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { bestAverage, bestTimeForDistance, elevationGain, isDuplicate, matchSession, parseCsvRows, parseFile, parseNumber, summarizeActivity } from '../src/logic/importer'
import { weeklyFromDays } from '../src/logic/recovery'
import { emptyProfile, type Session } from '../src/logic/types'

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)))
const profile = { ...emptyProfile(), hrMax: 190, hrRest: 50, lthr: 170 }
profile.ftp = [{ date: '2026-01-01', value: 250 }]

describe('GPX', () => {
  const f = parseFile('lauf.gpx', fx('lauf.gpx'))
  test('Sportart, Datum, Dauer, Distanz, Höhenmeter, Puls', () => {
    expect(f.error).toBeUndefined()
    expect(f.activities).toHaveLength(1)
    const a = summarizeActivity(f.activities[0], profile, 'a1')
    expect(a.discipline).toBe('run')
    expect(a.date).toBe('2026-10-06')
    expect(a.durationSec).toBe(3000)
    expect(a.distanceM).toBeGreaterThan(9950)
    expect(a.distanceM).toBeLessThan(10050)
    expect(a.avgHr).toBe(142)
    expect(a.maxHr).toBe(146)
    expect(a.avgCadence).toBe(86)
    expect(a.elevationM).toBeGreaterThan(20)
    expect(a.elevationM).toBeLessThan(40)
    // Puls 138–146 liegt bei Maximalpuls 190 in Zone 3 (133–151)
    expect(a.hrZoneSec![2]).toBe(3000)
    expect(a.loadSource).toBe('hr')
    expect(a.load).toBeGreaterThan(35)
    expect(a.load).toBeLessThan(60)
    // 5 km in 25:00 bei 3,333 m/s
    const b5 = a.bestEfforts!.find((b) => b.key === 5000)!
    expect(b5.value).toBeGreaterThan(1495)
    expect(b5.value).toBeLessThan(1505)
    expect(a.bestEfforts!.some((b) => b.key === 21097.5)).toBe(false)
    expect(a.stream!.length).toBeLessThanOrEqual(260)
  })
})

describe('TCX', () => {
  test('Rad mit Leistung', () => {
    const f = parseFile('rad.tcx', fx('rad.tcx'))
    expect(f.error).toBeUndefined()
    const a = summarizeActivity(f.activities[0], profile, 'a2')
    expect(a.discipline).toBe('bike')
    expect(a.durationSec).toBe(3600)
    expect(a.distanceM).toBe(30000)
    expect(a.avgPower).toBe(200)
    expect(a.np).toBeGreaterThanOrEqual(199)
    expect(a.np).toBeLessThanOrEqual(201)
    expect(a.loadSource).toBe('power')
    expect(a.load).toBe(64) // 1 h bei IF 0,8
    expect(a.powerZoneSec![2]).toBe(3600) // 190–210 W ist Zone 3 bei FTP 250
    expect(a.powerBests!.find((b) => b.key === 1200)!.value).toBe(200)
    expect(a.driftPct).toBeDefined()
    expect(Math.abs(a.driftPct!)).toBeLessThan(1)
  })
})

describe('FIT', () => {
  test('Puls, Leistung, Trittfrequenz', () => {
    const f = parseFile('rad.fit', fx('rad.fit'))
    expect(f.error).toBeUndefined()
    const a = summarizeActivity(f.activities[0], profile, 'a3')
    expect(a.discipline).toBe('bike')
    expect(a.date).toBe('2026-10-10')
    expect(a.durationSec).toBe(2400)
    expect(a.distanceM).toBe(20400)
    expect(a.avgHr).toBe(140)
    expect(a.avgPower).toBe(200)
    expect(a.avgCadence).toBe(90)
    expect(a.elevationM).toBe(120)
    // 20 min bei 250 W sind die beste 20-Minuten-Leistung
    expect(a.powerBests!.find((b) => b.key === 1200)!.value).toBe(250)
    expect(a.powerBests!.find((b) => b.key === 300)!.value).toBe(250)
    expect(a.np).toBeGreaterThan(200)
  })
  test('wird auch ohne Dateiendung erkannt', () => {
    expect(parseFile('aktivitaet', fx('rad.fit')).activities).toHaveLength(1)
  })
})

describe('CSV', () => {
  test('Whoop: Trainings', () => {
    const f = parseFile('workouts.csv', fx('whoop_workouts.csv'))
    expect(f.activities).toHaveLength(2)
    const a = summarizeActivity(f.activities[0], profile, 'w1')
    expect(a).toMatchObject({ discipline: 'run', date: '2026-10-12', durationSec: 3120, distanceM: 9100, avgHr: 149, maxHr: 171, loadSource: 'hr' })
    expect(summarizeActivity(f.activities[1], profile, 'w2').discipline).toBe('gym')
  })
  test('Whoop: Erholungsdaten', () => {
    const f = parseFile('physiological_cycles.csv', fx('whoop_physiological_cycles.csv'))
    expect(f.recoveryDays).toHaveLength(4)
    expect(f.recoveryDays[0]).toEqual({ date: '2026-10-04', hrv: 62, rhr: 48, sleepH: 7.3 })
    const weeks = weeklyFromDays(f.recoveryDays)
    expect(weeks.map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
    expect(weeks[1].hrv).toBe(62)
  })
  test('Garmin: Aktivitätenliste mit deutschem Zahlenformat', () => {
    const f = parseFile('Activities.csv', fx('garmin_activities.csv'))
    expect(f.activities.map((a) => a.discipline)).toEqual(['run', 'bike', 'swim'])
    expect(f.activities[0].summary).toMatchObject({ distanceM: 12020, durationSec: 3750, avgHr: 146, elevationM: 85 })
    expect(f.activities[2].summary.distanceM).toBe(2000)
    expect(f.activities[2].summary.elevationM).toBeUndefined()
  })
  test('eigene Tabelle mit Datum, HRV, Ruhepuls; unlesbare Zeilen werden übersprungen', () => {
    const f = parseFile('erholung.csv', fx('erholung_eigen.csv'))
    expect(f.recoveryDays).toEqual([
      { date: '2026-10-01', hrv: 61, rhr: 48, sleepH: 7.5 },
      { date: '2026-10-02', hrv: 59, rhr: 49, sleepH: 7 },
    ])
  })
  test('Zahlen und Zeilen', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5)
    expect(parseNumber('1,234.5')).toBe(1234.5)
    expect(parseNumber('12,02')).toBe(12.02)
    expect(parseNumber('1,234')).toBe(1234)
    expect(parseNumber('--')).toBeUndefined()
    expect(parseCsvRows('a,"b,c",d\n1,"x ""y""",3\n')).toEqual([
      ['a', 'b,c', 'd'],
      ['1', 'x "y"', '3'],
    ])
  })
})

describe('fehlerhafte Dateien führen zu einer verständlichen Meldung', () => {
  test.each([
    ['kaputt.gpx', /beschädigt|keine Aufzeichnung/],
    ['route_ohne_zeit.gpx', /Zeitstempel/],
    ['kaputt.fit', /FIT-Datei|beschädigt/],
    ['leer.csv', /leer/],
    ['unbekannt.csv', /Spalten/],
  ])('%s', (name, pattern) => {
    const f = parseFile(name, fx(name))
    expect(f.activities).toEqual([])
    expect(f.error).toMatch(pattern)
  })
  test('unbekanntes Format, Zufallsdaten, abgeschnittene Dateien', () => {
    expect(parseFile('bild.jpg', new Uint8Array([1, 2, 3])).error).toContain('nicht unterstützt')
    expect(parseFile('x.fit', new Uint8Array(500).map((_, i) => (i * 37) % 256)).error).toBeDefined()
    expect(parseFile('x.tcx', new TextEncoder().encode('<TrainingCenterDatabase><Activities>')).error).toBeDefined()
    const full = fx('rad.fit')
    for (const cut of [10, 14, 100, 5000, full.length - 1]) expect(() => parseFile('x.fit', full.subarray(0, cut))).not.toThrow()
    // halbe Datei: der lesbare Teil wird übernommen und als unvollständig gekennzeichnet
    const half = parseFile('x.fit', full.subarray(0, Math.floor(full.length / 2)))
    expect(half.activities).toHaveLength(1)
    expect(half.note).toContain('unvollständig')
    const gpx = fx('lauf.gpx')
    for (const cut of [50, 500, 5000]) expect(() => parseFile('x.gpx', gpx.subarray(0, cut))).not.toThrow()
  })
})

describe('Hilfsrechnungen', () => {
  test('Höhenmeter ignorieren Rauschen', () => {
    expect(elevationGain([100, 100.5, 100, 100.4, 100, 100.3, 100])).toBe(0)
    const climb = Array.from({ length: 101 }, (_, i) => 100 + i)
    expect(elevationGain(climb)).toBeGreaterThanOrEqual(97)
    expect(elevationGain(climb)).toBeLessThanOrEqual(100)
  })
  test('schnellster Abschnitt', () => {
    // 1 km in 300 s, dann 1 km in 240 s, dann 1 km in 300 s
    const pts = [0, 300, 540, 840].map((t, i) => ({ t, dist: i * 1000 }))
    expect(bestTimeForDistance(pts, 1000)).toBe(240)
    expect(bestTimeForDistance(pts, 2000)).toBe(540)
    expect(bestTimeForDistance(pts, 5000)).toBeUndefined()
    expect(bestAverage([100, 100, 300, 300, 100], 2)).toBe(300)
    expect(bestAverage([100], 2)).toBeUndefined()
  })
})

describe('Zuordnung und Duplikate', () => {
  const a = summarizeActivity(parseFile('lauf.gpx', fx('lauf.gpx')).activities[0], profile, 'a1')
  const S = (o: Partial<Session>): Session => ({ id: 'x', planId: 'p', weekIndex: 0, date: '2026-10-06', discipline: 'run', kind: 'easy', title: 'T', steps: [], durationMin: 50, load: 40, hard: false, key: false, deload: false, status: 'planned', ...o })
  test('gleicher Tag und Sportart, bei mehreren die ähnlichste Dauer', () => {
    const m = matchSession(a, [S({ id: 'kurz', durationMin: 20 }), S({ id: 'passt', durationMin: 55 }), S({ id: 'rad', discipline: 'bike' })])
    expect(m).toEqual({ sessionId: 'passt', confidence: 'sicher' })
  })
  test('Nachbartag nur als Möglichkeit, andere Sportart gar nicht', () => {
    expect(matchSession(a, [S({ id: 'gestern', date: '2026-10-05' })])).toEqual({ sessionId: 'gestern', confidence: 'möglich' })
    expect(matchSession(a, [S({ discipline: 'bike' })])).toBeUndefined()
    expect(matchSession(a, [S({ date: '2026-10-09' })])).toBeUndefined()
    expect(matchSession(a, [S({ activityId: 'schon' })])).toBeUndefined()
  })
  test('Koppeleinheit nimmt Rad oder Lauf', () => {
    expect(matchSession(a, [S({ id: 'b', kind: 'brick', discipline: 'bike' })])?.sessionId).toBe('b')
  })
  test('doppelter Import wird erkannt, auch aus anderem Format', () => {
    expect(isDuplicate(a, [a])).toBe(true)
    expect(isDuplicate({ ...a, id: 'b', source: 'tcx', start: new Date(Date.parse(a.start) + 30000).toISOString() }, [a])).toBe(true)
    expect(isDuplicate({ ...a, id: 'c', start: new Date(Date.parse(a.start) + 6 * 3600000).toISOString() }, [a])).toBe(false)
    expect(isDuplicate({ ...a, id: 'd', discipline: 'bike', start: new Date(Date.parse(a.start) + 3600000).toISOString() }, [a])).toBe(false)
  })
})
