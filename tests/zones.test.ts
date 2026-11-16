import { describe, expect, test } from 'vitest'
import { emptyProfile } from '../src/logic/types'
import { cssPace, epley, estimateHrMax, hrZones, pacesFromVdot, powerZones, predictRace, refsFromProfile, renderText, runFitness, vdotFromRace, vdotFromThresholdPace, zoneOf } from '../src/logic/zones'
import { checkValue } from '../src/logic/templates'

describe('Herzfrequenzzonen', () => {
  test('nach Maximalpuls: 50/60/70/80/90 %', () => {
    const z = hrZones({ ...emptyProfile(), hrMax: 190 })!
    expect(z.zones.map((x) => x.lo)).toEqual([95, 114, 133, 152, 171])
    expect(z.zones[4].hi).toBe(190)
    expect(z.zones[0].hi).toBe(113)
  })
  test('nach Karvonen: Ruhepuls + Anteil der Reserve', () => {
    const z = hrZones({ ...emptyProfile(), hrMax: 190, hrRest: 50, hrMethod: 'karvonen' })!
    expect(z.zones.map((x) => x.lo)).toEqual([120, 134, 148, 162, 176])
  })
  test('nach Schwellenpuls, Rad mit eigenen Grenzen', () => {
    const p = { ...emptyProfile(), lthr: 170, hrMethod: 'lthr' as const }
    expect(hrZones(p, 'run')!.zones.map((x) => x.lo)).toEqual([119, 145, 153, 162, 170])
    expect(hrZones(p, 'bike')!.zones.map((x) => x.lo)).toEqual([116, 138, 153, 160, 170])
  })
  test('von Hand und getrennte Radzonen', () => {
    const p = { ...emptyProfile(), hrMethod: 'manual' as const, hrManual: [100, 120, 140, 155, 170], hrMax: 185, bikeHr: { manual: [95, 115, 135, 150, 165], hrMax: 180 } }
    expect(hrZones(p, 'run')!.zones[2]).toMatchObject({ lo: 140, hi: 154 })
    expect(hrZones(p, 'bike')!.zones[4]).toMatchObject({ lo: 165, hi: 180 })
  })
  test('ohne Maximalpuls: Schätzung aus dem Alter, als Schätzung gekennzeichnet', () => {
    expect(estimateHrMax(1986, 2026)).toBe(180)
    const z = hrZones({ ...emptyProfile(), birthYear: new Date().getFullYear() - 40 })!
    expect(z.source).toBe('estimate')
    expect(hrZones(emptyProfile())).toBeUndefined()
  })
  test('zoneOf', () => {
    const z = hrZones({ ...emptyProfile(), hrMax: 190 })!.zones
    expect(zoneOf(z, 140)).toBe(3)
    expect(zoneOf(z, 80)).toBe(0)
    expect(zoneOf(z, 200)).toBe(5)
  })
})

describe('Leistungszonen nach Coggan', () => {
  test('FTP 250', () => {
    const z = powerZones(250)
    expect(z.map((x) => x.lo)).toEqual([0, 140, 190, 228, 265, 303, 378])
    expect(z[3].hi).toBe(264)
  })
})

describe('VDOT nach Daniels', () => {
  test('bekannte Tabellenwerte', () => {
    expect(vdotFromRace(5000, 19 * 60 + 57)).toBeCloseTo(50, 0)
    expect(vdotFromRace(10000, 50 * 60 + 3)).toBeCloseTo(40, 0)
    expect(vdotFromRace(42195, 3 * 3600 + 10 * 60 + 49)).toBeCloseTo(50, 0)
  })
  test('Prognose ist die Umkehrung', () => {
    for (const d of [5000, 10000, 21097.5, 42195]) expect(vdotFromRace(d, predictRace(47.3, d))).toBeCloseTo(47.3, 3)
    expect(predictRace(50, 21097.5)).toBeGreaterThan(91 * 60)
    expect(predictRace(50, 21097.5)).toBeLessThan(92.5 * 60)
  })
  test('Tempobereiche für VDOT 50', () => {
    const p = pacesFromVdot(50)
    expect(p.T).toBeGreaterThan(253)
    expect(p.T).toBeLessThan(257) // 4:15 min/km
    expect(p.I).toBeGreaterThan(232)
    expect(p.I).toBeLessThan(237) // 3:55
    expect(p.M).toBeGreaterThan(269)
    expect(p.M).toBeLessThan(273) // 4:31
    expect(p.E[0]).toBeGreaterThan(p.E[1])
    expect(p.E[1]).toBeGreaterThan(p.M)
    expect(p.R).toBeLessThan(p.I)
  })
  test('Schwellentempo ergibt denselben VDOT', () => {
    expect(vdotFromThresholdPace(pacesFromVdot(44).T)).toBeCloseTo(44, 5)
  })
  test('Wettkampfzeit hat Vorrang vor Schwellentempo und VO2max', () => {
    const p = emptyProfile()
    p.vo2max = [{ date: '2026-10-01', value: 52, sport: 'run', source: 'watch' }]
    expect(runFitness(p, '2026-11-01')).toMatchObject({ source: 'vo2max', estimate: true })
    p.thresholdPace = [{ date: '2026-10-01', value: 270 }]
    expect(runFitness(p, '2026-11-01')!.source).toBe('threshold')
    p.raceResults = [{ date: '2026-09-01', distanceM: 10000, timeSec: 45 * 60 }]
    expect(runFitness(p, '2026-11-01')!.source).toBe('race')
    // eine zwei Jahre alte Zeit zählt erst, wenn nichts anderes vorliegt
    p.raceResults = [{ date: '2024-09-01', distanceM: 10000, timeSec: 45 * 60 }]
    expect(runFitness(p, '2026-11-01')!.source).toBe('threshold')
  })
})

describe('Schwimmen und Kraft', () => {
  test('CSS aus 400 m in 6:40 und 200 m in 3:10 = 1:45 pro 100 m', () => {
    expect(cssPace(400, 190)).toBe(105)
  })
  test('Epley', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(100, 5)).toBeCloseTo(116.67, 2)
    expect(epley(80, 10)).toBeCloseTo(106.67, 2)
  })
})

describe('Vorgaben in Texten', () => {
  test('eigene Werte werden eingesetzt', () => {
    const p = { ...emptyProfile(), hrMax: 190 }
    p.raceResults = [{ date: '2026-10-01', distanceM: 5000, timeSec: 19 * 60 + 57 }]
    p.ftp = [{ date: '2026-10-01', value: 250 }]
    p.css = [{ date: '2026-10-01', value: 105 }]
    const r = refsFromProfile(p, '2026-11-01')
    expect(renderText('bei {pace:T}', r)).toBe('bei 4:15 min/km (Schwellentempo)')
    expect(renderText('{hr:2}', r)).toBe('Puls 114–132 (Zone 2)')
    expect(renderText('{hr:1-2}', r)).toBe('Puls 95–132 (Zone 1–2)')
    expect(renderText('{pw:88-94}', r)).toBe('220–235 W')
    expect(renderText('{css:5}', r)).toBe('1:50 min/100 m')
    expect(renderText('{pace:5k}', r)).toContain('3:59 min/km')
  })
  test('ohne Werte steht eine Beschreibung nach Gefühl, nie ein leerer Platzhalter', () => {
    const r = refsFromProfile(emptyProfile())
    for (const t of ['{pace:E}', '{pace:T}', '{pace:HM}', '{hr:4}', '{pw:95-100}', '{css:0}', '{hrb:2}']) {
      const out = renderText(t, r)
      expect(out).not.toContain('{')
      expect(out.length).toBeGreaterThan(5)
    }
  })
  test('alte Einheiten behalten die damals gültigen Werte', () => {
    const p = emptyProfile()
    p.ftp = [
      { date: '2026-01-01', value: 200 },
      { date: '2026-06-01', value: 250 },
    ]
    expect(renderText('{pw:100-100}', refsFromProfile(p, '2026-03-01'))).toBe('200–200 W')
    expect(renderText('{pw:100-100}', refsFromProfile(p, '2026-07-01'))).toBe('250–250 W')
  })
})

describe('Plausibilität von Eingaben', () => {
  test('Maximalpuls 300 wird abgefangen', () => {
    expect(checkValue('hrMax', 300)).toContain('unplausibel')
    expect(checkValue('hrMax', 185)).toBeUndefined()
    expect(checkValue('lthr', 190, { hrMax: 185 })).toContain('unter dem Maximalpuls')
    expect(checkValue('hrRest', 150, { hrMax: 180 })).toBeDefined()
    expect(checkValue('ftp', 1200)).toBeDefined()
  })
})
