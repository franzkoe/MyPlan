import { describe, expect, test } from 'vitest'
import { addDays, diffDays, weekday } from '../src/logic/dates'
import { assignDays, buildCtx, deloadWeeks, generatePlan, maxBuildStreak, planWeeks, sessionVolume, summarize, taperWeeks } from '../src/logic/generator'
import { GOALS, templateConfig, validateConfig, WEEK_TEMPLATES, weekTemplateConfig } from '../src/logic/templates'
import type { Level, PlanConfig, Sport } from '../src/logic/types'
import { refsFromProfile, renderText } from '../src/logic/zones'
import { emptyProfile } from '../src/logic/types'
import { build, easeSpec } from '../src/logic/workouts'

const START = '2026-11-16' // Montag
const ctx = (l: Level) => buildCtx(l)
const all: { sport: Sport; goal: string; level: Level; cfg: PlanConfig }[] = []
for (const sport of Object.keys(GOALS) as Sport[]) for (const g of GOALS[sport]) for (const level of [0, 1, 2] as Level[]) all.push({ sport, goal: g.id, level, cfg: templateConfig(sport, g.id, level, { startDate: START, distanceKm: g.id === 'ultra' ? 70 : undefined }) })

describe('Wochenstruktur', () => {
  test('Standard: jede vierte Woche Entlastung mit 35 % weniger Umfang', () => {
    const cfg = templateConfig('run', '10k', 1, { startDate: START })
    const w = planWeeks(cfg)
    expect(w.filter((x) => x.deload).map((x) => x.index)).toEqual([3, 7, 11])
    expect(w[0].volume).toBe(32)
    expect(w[1].volume).toBeCloseTo(32 * 1.05)
    expect(w[2].volume).toBeCloseTo(32 * 1.05 ** 2)
    expect(w[3].volume).toBeCloseTo(w[2].volume * 0.65)
    // nach der Entlastung geht es auf dem Niveau der letzten Aufbauwoche weiter
    expect(w[4].volume).toBeCloseTo(w[2].volume)
    expect(w[5].volume).toBeCloseTo(w[2].volume * 1.05)
  })
  test('jede dritte Woche einstellbar', () => {
    const cfg = { ...templateConfig('run', '10k', 1, { startDate: START }), deloadEvery: 3 as const }
    expect(deloadWeeks(cfg)).toEqual([2, 5, 8, 11])
  })
  test('mit Zieldatum: rückwärts gerechnet, Tapering am Ende, Wettkampf am Zieltag', () => {
    const cfg = templateConfig('run', 'marathon', 1, { startDate: START, raceDate: '2027-04-18', targetTimeSec: 3.5 * 3600 })
    expect(taperWeeks(cfg)).toBe(3)
    const w = planWeeks(cfg)
    expect(w.length).toBe(18)
    expect(weekday(cfg.startDate)).toBe(0)
    expect(diffDays('2027-04-18', w[17].start)).toBe(6)
    const peak = Math.max(...w.map((x) => x.volume))
    expect(w[15].volume).toBeCloseTo(peak * 0.8)
    expect(w[16].volume).toBeCloseTo(peak * 0.6)
    expect(w[17].volume).toBeCloseTo(peak * 0.4)
    const s = generatePlan('p', cfg, ctx(1))
    const race = s.filter((x) => x.kind === 'race')
    expect(race).toHaveLength(1)
    expect(race[0].date).toBe('2027-04-18')
    expect(race[0].steps[1].text).toContain('3:30:00')
    expect(s.filter((x) => x.date === '2027-04-17')).toHaveLength(0)
    expect(s.every((x) => x.date <= '2027-04-18')).toBe(true)
  })
  test('Entlastungswochen lassen sich nicht abschalten', () => {
    for (const { cfg } of all) {
      expect(deloadWeeks(cfg).length).toBeGreaterThan(0)
      expect(maxBuildStreak(cfg)).toBeLessThanOrEqual(4)
    }
    const short = { ...templateConfig('run', '5k', 0, { startDate: START }), weeks: 3 }
    expect(deloadWeeks(short)).toEqual([2])
  })
})

describe('alle Vorlagen', () => {
  test.each(all)('$sport $goal Niveau $level', ({ sport, level, cfg }) => {
    expect(validateConfig(cfg, START).filter((i) => i.level === 'error')).toEqual([])
    const sessions = generatePlan('p', cfg, ctx(level))
    const weeks = summarize(cfg, sessions)
    const refs = refsFromProfile(emptyProfile())
    for (const w of weeks) {
      const ss = sessions.filter((s) => s.weekIndex === w.index)
      expect(ss.length).toBeGreaterThan(0)
      // Umfang trifft die Vorgabe
      const tol = sport === 'gym' ? 0.35 : sport === 'tri' ? 0.3 : 0.22
      expect(Math.abs(w.actual - w.volume) / w.volume).toBeLessThan(tol)
      // mindestens ein Ruhetag
      expect(new Set(ss.map((s) => s.date)).size).toBeLessThanOrEqual(6)
      // harte Einheiten nie an aufeinanderfolgenden Tagen
      const hard = ss.filter((s) => s.hard).map((s) => s.date).sort()
      for (let i = 1; i < hard.length; i++) expect(diffDays(hard[i], hard[i - 1])).toBeGreaterThanOrEqual(2)
      // höchstens drei harte Einheiten
      expect(hard.length).toBeLessThanOrEqual(3)
      // Entlastungswoche: höchstens eine harte Einheit
      if (w.deload) expect(hard.length).toBeLessThanOrEqual(1)
      for (const s of ss) {
        expect(s.date >= w.start && s.date <= addDays(w.start, 6)).toBe(true)
        expect(s.durationMin).toBeGreaterThan(9)
        expect(s.durationMin).toBeLessThan(sport === 'bike' || sport === 'tri' ? 480 : sport === 'run' ? 420 : 200)
        expect(s.steps.length).toBeGreaterThan(0)
        expect(s.title).not.toMatch(/NaN|undefined|Infinity/)
        for (const st of s.steps) {
          const txt = renderText(st.text, refs)
          expect(txt).not.toMatch(/NaN|undefined|Infinity|\{/)
        }
        // jede Einheit lässt sich abschwächen
        if (s.spec) expect(() => build(easeSpec(s.spec!), ctx(level))).not.toThrow()
      }
    }
    // Entlastung ist spürbar leichter als die Woche davor
    for (const w of weeks) if (w.deload && w.index > 0) expect(w.actual).toBeLessThan(weeks[w.index - 1].actual * 0.85)
    // gleiche Eingabe, gleiches Ergebnis
    expect(generatePlan('p', cfg, ctx(level))).toEqual(sessions)
  })
})

describe('Ausdauer: Verteilung der Intensität', () => {
  test('Laufpläne: der überwiegende Teil der Einheiten ist locker', () => {
    for (const { sport, cfg, level } of all.filter((x) => x.sport === 'run')) {
      const s = generatePlan('p', cfg, ctx(level)).filter((x) => x.kind !== 'race')
      // gezählt nach Einheiten wie bei Seiler; bei drei Einheiten pro Woche ist höchstens eine davon hart
      expect(sport).toBe('run')
      expect(s.filter((x) => x.hard).length / s.length).toBeLessThanOrEqual(cfg.sessionsPerWeek <= 3 ? 0.34 : 0.4)
    }
  })
  test('bergige Laufpläne enthalten Höhenmeter, Bergintervalle und Bergab-Training', () => {
    const cfg = templateConfig('run', 'half', 1, { startDate: START, terrain: 'hilly' })
    const s = generatePlan('p', cfg, ctx(1))
    expect(s.some((x) => x.kind === 'hills')).toBe(true)
    expect(s.some((x) => x.kind === 'long' && (x.elevationM ?? 0) > 0)).toBe(true)
    expect(s.some((x) => x.title.includes('Bergab'))).toBe(true)
  })
  test('Ultra: lange Einheiten nach Zeit', () => {
    const cfg = templateConfig('run', 'ultra100', 1, { startDate: START, terrain: 'hilly' })
    const long = generatePlan('p', cfg, ctx(1)).filter((x) => x.kind === 'long')
    expect(long.every((x) => /h|min/.test(x.title) && !x.title.includes('km'))).toBe(true)
  })
  test('Triathlon: Koppeleinheit jede Woche, alle drei Disziplinen', () => {
    const cfg = templateConfig('tri', 'olympic', 1, { startDate: START })
    const s = generatePlan('p', cfg, ctx(1))
    for (let w = 0; w < cfg.weeks; w++) {
      const ss = s.filter((x) => x.weekIndex === w)
      expect(ss.filter((x) => x.kind === 'brick')).toHaveLength(1)
      expect(new Set(ss.map((x) => x.discipline))).toEqual(new Set(['swim', 'bike', 'run']))
    }
  })
  test('Rad bergig: Schwelle und Kraftausdauer am Berg', () => {
    const cfg = templateConfig('bike', '100k', 2, { startDate: START, terrain: 'hilly' })
    const s = generatePlan('p', cfg, ctx(2))
    expect(s.some((x) => x.title.includes('Kraftausdauer am Berg'))).toBe(true)
    expect(s.some((x) => x.kind === 'threshold')).toBe(true)
  })
})

describe('Kraft', () => {
  test('Deload: weniger Sätze und weniger Last', () => {
    const cfg = templateConfig('gym', 'hypertrophy', 1, { startDate: START })
    const s = generatePlan('p', cfg, ctx(1))
    const w2 = s.filter((x) => x.weekIndex === 2)
    const w3 = s.filter((x) => x.weekIndex === 3)
    const sets = (l: typeof s) => l.reduce((a, x) => a + sessionVolume('gym', x), 0)
    expect(sets(w3)).toBeLessThan(sets(w2) * 0.75)
    const pct = (l: typeof s) => Math.max(...l.flatMap((x) => x.gym!.map((g) => g.pct1rm ?? 0)))
    expect(pct(w3)).toBeLessThan(pct(w2))
    expect(w3.every((x) => x.title.includes('Deload'))).toBe(true)
  })
  test('progressive Überlastung innerhalb eines Blocks', () => {
    const cfg = templateConfig('gym', 'maxStrength', 1, { startDate: START })
    const s = generatePlan('p', cfg, ctx(1))
    const top = (w: number) => Math.max(...s.filter((x) => x.weekIndex === w).flatMap((x) => x.gym!.map((g) => g.pct1rm ?? 0)))
    expect(top(1)).toBeGreaterThan(top(0))
    expect(top(2)).toBeGreaterThan(top(1))
    expect(top(4)).toBeGreaterThan(top(0))
  })
  test('Aufteilungen', () => {
    const ul = generatePlan('p', { ...templateConfig('gym', 'hypertrophy', 1, { startDate: START }), split: 'upperLower' }, ctx(1))
    expect(new Set(ul.filter((x) => x.weekIndex === 0).map((x) => x.title.split(',')[0]))).toEqual(new Set(['Oberkörper A', 'Unterkörper A', 'Oberkörper B', 'Unterkörper B']))
    const ppl = generatePlan('p', { ...templateConfig('gym', 'hypertrophy', 0, { startDate: START }), split: 'ppl' }, ctx(0))
    expect(ppl.filter((x) => x.weekIndex === 0).map((x) => x.title.split(',')[0]).sort()).toEqual(['Beine', 'Pull (Ziehen)', 'Push (Drücken)'])
  })
})

describe('Verteilung auf Wochentage', () => {
  test('lange Einheit am Sonntag, harte mit Abstand', () => {
    const days = assignDays([{ spec: { builder: 'x', p: {} }, hard: true }, { spec: { builder: 'x', p: {} }, long: true }, { spec: { builder: 'x', p: {} } }, { spec: { builder: 'x', p: {} } }], [1, 3, 4, 6])
    expect(days[1]).toBe(6)
    expect([1, 3]).toContain(days[0])
    expect(new Set(days).size).toBe(4)
  })
  test('Tage mit harten Einheiten anderer Pläne werden gemieden', () => {
    const d = assignDays([{ spec: { builder: 'x', p: {} }, hard: true }, { spec: { builder: 'x', p: {} }, hard: true }], [0, 1, 2, 3, 4, 5, 6], [1, 4])
    for (const x of d) expect([1, 4]).not.toContain(x)
  })
  test('erster Wochentag Sonntag', () => {
    const cfg = { ...templateConfig('run', '5k', 0, { startDate: '2026-11-15', weekStart: 6 }) }
    expect(cfg.startDate).toBe('2026-11-15')
    const s = generatePlan('p', cfg, ctx(0), 6)
    for (const x of s) expect(x.date >= addDays(cfg.startDate, x.weekIndex * 7) && x.date <= addDays(cfg.startDate, x.weekIndex * 7 + 6)).toBe(true)
    expect(s.filter((x) => x.kind === 'long').every((x) => weekday(x.date) === 6)).toBe(true)
  })
})

describe('einzelne Wochen und Ausrichtung', () => {
  test.each(WEEK_TEMPLATES)('$name', (t) => {
    const cfg = weekTemplateConfig(t, 1, START)
    const s = generatePlan('w', cfg, ctx(1))
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x) => x.weekIndex === 0)).toBe(true)
    if (t.focus === 'base') expect(s.some((x) => x.hard)).toBe(false)
    if (t.deload) expect(s.every((x) => x.deload)).toBe(true)
    const vol = s.reduce((a, x) => a + sessionVolume(t.sport, x), 0)
    expect(Math.abs(vol - t.volume[1]) / t.volume[1]).toBeLessThan(0.35)
  })
  test('Ausrichtung: nur Intervalle, nur Schwelle, Berg', () => {
    const base = templateConfig('run', '10k', 2, { startDate: START })
    const kinds = (focus: PlanConfig['focus']) => new Set(generatePlan('p', { ...base, focus }, ctx(2)).filter((x) => x.hard).map((x) => x.kind))
    expect(kinds('intervals')).toEqual(new Set(['intervals']))
    expect(kinds('threshold')).toEqual(new Set(['threshold']))
    expect(kinds('hills').has('hills')).toBe(true)
    expect(kinds('base').size).toBe(0)
  })
  test('Woche tauschen: eine Woche bekommt eine andere Ausrichtung', () => {
    const base = templateConfig('run', '10k', 1, { startDate: START })
    const s = generatePlan('p', { ...base, weekOverrides: { 1: { focus: 'base' } } }, ctx(1))
    expect(s.filter((x) => x.weekIndex === 1).some((x) => x.hard)).toBe(false)
    expect(s.filter((x) => x.weekIndex === 2).some((x) => x.hard)).toBe(true)
  })
})

describe('Plausibilität', () => {
  test('Marathon in drei Wochen', () => {
    const cfg = templateConfig('run', 'marathon', 1, { startDate: START, raceDate: addDays(START, 21) })
    const issues = validateConfig(cfg, START)
    expect(issues.some((i) => i.level === 'error' && i.text.includes('mindestens 12 Wochen'))).toBe(true)
  })
  test('sieben Einheiten pro Woche, Steigerung über 10 %', () => {
    const cfg = { ...templateConfig('run', '10k', 1, { startDate: START }), sessionsPerWeek: 7, days: [0, 1, 2, 3, 4, 5, 6], rampPct: 15 }
    const issues = validateConfig(cfg, START)
    expect(issues.filter((i) => i.level === 'error').length).toBeGreaterThanOrEqual(2)
    expect(issues.some((i) => i.level === 'warn' && i.text.includes('10 %'))).toBe(true)
    expect(issues.find((i) => i.fix)?.fix?.patch.sessionsPerWeek).toBe(6)
  })
})
