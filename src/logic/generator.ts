// Plangenerator: aus den Einstellungen entsteht ein vollständiger Plan mit konkreten Einheiten.
// Grundlagen und Quellen: docs/trainingslehre.md
import { addDays, diffDays, startOfWeek, weekday } from './dates'
import { gymRotation } from './exercises'
import type { Focus, Level, PlanConfig, Session, SessionSpec, Sport } from './types'
import { build, type BuildCtx } from './workouts'
import { pacesFromVdot, type Refs } from './zones'

export interface WeekInfo {
  index: number
  start: string
  deload: boolean
  taper: boolean
  phase: 'base' | 'build' | 'peak' | 'taper'
  /** geplanter Umfang in der Einheit des Plans */
  volume: number
  /** Fortschritt im Aufbau, 0 bis 1 */
  prog: number
  /** Position im Aufbaublock seit der letzten Entlastung */
  blockWeek: number
  block: number
  focus: Focus
}

export const DEFAULT_VDOT: Record<Level, number> = { 0: 32, 1: 40, 2: 48 }
export const DEFAULT_CSS: Record<Level, number> = { 0: 150, 1: 120, 2: 100 }

export function buildCtx(level: Level, refs?: Refs): BuildCtx {
  return { paces: refs?.paces ?? pacesFromVdot(DEFAULT_VDOT[level]), css: refs?.css ?? DEFAULT_CSS[level] }
}

export const VOLUME_UNIT: Record<Sport, string> = { run: 'km', bike: 'h', swim: 'km', tri: 'h', gym: 'Sätze' }

export const RUN_KM: Record<string, number> = { '5k': 5, '10k': 10, half: 21.1, marathon: 42.2, ultra50: 50, ultra100: 100 }

export function raceKm(cfg: PlanConfig): number | undefined {
  if (cfg.sport === 'run') return cfg.goal === 'ultra' ? cfg.distanceKm : (RUN_KM[cfg.goal] ?? cfg.distanceKm)
  if (cfg.sport === 'bike') return cfg.distanceKm ?? ({ '50k': 50, '100k': 100, '200k': 200 } as Record<string, number>)[cfg.goal]
  return undefined
}

const isUltra = (cfg: PlanConfig) => cfg.sport === 'run' && cfg.goal.startsWith('ultra')

export function taperWeeks(cfg: PlanConfig): number {
  if (!cfg.raceDate || cfg.single) return 0
  let t = 1
  if (cfg.sport === 'run') t = cfg.goal === 'half' || cfg.goal === 'ultra50' ? 2 : cfg.goal === 'marathon' || isUltra(cfg) ? 3 : 1
  if (cfg.sport === 'tri') t = cfg.goal === 'half' ? 2 : cfg.goal === 'full' ? 3 : 1
  if (cfg.sport === 'bike') t = cfg.goal === '200k' || cfg.goal === 'multi' ? 2 : 1
  return Math.max(0, Math.min(t, Math.floor(cfg.weeks / 4)))
}

const TAPER_FACTORS: Record<number, number[]> = { 1: [0.6], 2: [0.7, 0.5], 3: [0.8, 0.6, 0.4] }
export const DELOAD_FACTOR = 0.65

/** Indizes der Entlastungswochen */
export function deloadWeeks(cfg: PlanConfig): number[] {
  if (cfg.single) return Object.entries(cfg.weekOverrides ?? {}).filter(([, v]) => v.deload).map(([k]) => Number(k))
  const nonTaper = cfg.weeks - taperWeeks(cfg)
  const set = new Set<number>()
  if (cfg.deloadWeeks) cfg.deloadWeeks.filter((i) => i >= 0 && i < nonTaper).forEach((i) => set.add(i))
  else
    for (let i = 0; i < nonTaper; i++) {
      const lastBeforeTaper = i === nonTaper - 1 && nonTaper < cfg.weeks
      if ((i + 1) % cfg.deloadEvery === 0 && !lastBeforeTaper) set.add(i)
    }
  for (const [from, to] of Object.entries(cfg.deloadMoves ?? {})) {
    if (set.has(Number(from)) && to >= 0 && to < nonTaper) {
      set.delete(Number(from))
      set.add(to)
    }
  }
  for (const [k, v] of Object.entries(cfg.weekOverrides ?? {})) if (v.deload && Number(k) < nonTaper) set.add(Number(k))
  if (set.size === 0 && cfg.weeks >= 3 && nonTaper === cfg.weeks) set.add(cfg.weeks - 1)
  return [...set].sort((a, b) => a - b)
}

/** Längste Folge von Aufbauwochen ohne Entlastung */
export function maxBuildStreak(cfg: PlanConfig): number {
  const d = new Set(deloadWeeks(cfg))
  const nonTaper = cfg.weeks - taperWeeks(cfg)
  let run = 0
  let max = 0
  for (let i = 0; i < nonTaper; i++) {
    if (d.has(i)) run = 0
    else max = Math.max(max, ++run)
  }
  return max
}

export function weekStartDate(cfg: PlanConfig, index: number): string {
  let shift = 0
  for (const g of cfg.gaps ?? []) if (g.atWeek <= index) shift += g.weeks
  return addDays(cfg.startDate, (index + shift) * 7)
}

export function planWeeks(cfg: PlanConfig): WeekInfo[] {
  const taper = taperWeeks(cfg)
  const nonTaper = cfg.weeks - taper
  const deloads = new Set(deloadWeeks(cfg))
  const out: WeekInfo[] = []
  let next = cfg.startVolume
  let lastBuild = cfg.startVolume
  let peak = cfg.startVolume
  let blockWeek = 0
  let block = 0
  for (let i = 0; i < cfg.weeks; i++) {
    const isTaper = i >= nonTaper
    const deload = !isTaper && deloads.has(i)
    let volume: number
    if (isTaper) volume = peak * TAPER_FACTORS[taper][i - nonTaper]
    else if (deload) {
      volume = lastBuild * DELOAD_FACTOR
      next = lastBuild
    } else {
      volume = next
      lastBuild = next
      peak = Math.max(peak, next)
      next = next * (1 + cfg.rampPct / 100)
    }
    volume *= cfg.weekFactors?.[i] ?? 1
    const frac = nonTaper > 1 ? i / nonTaper : 0
    out.push({
      index: i,
      start: weekStartDate(cfg, i),
      deload,
      taper: isTaper,
      phase: isTaper ? 'taper' : frac < 0.4 ? 'base' : frac < 0.8 ? 'build' : 'peak',
      volume,
      prog: nonTaper > 1 ? Math.min(1, i / (nonTaper - 1)) : 0,
      blockWeek: deload ? 0 : blockWeek,
      block,
      focus: cfg.weekOverrides?.[i]?.focus ?? cfg.focus,
    })
    if (deload) {
      blockWeek = 0
      block++
    } else blockWeek++
  }
  return out
}

// ---------- Verteilung auf Wochentage ----------

export interface Slot {
  spec: SessionSpec
  hard?: boolean
  long?: boolean
  key?: boolean
  /** darf als zweite Einheit auf einen belegten Tag */
  stackable?: boolean
  /** zählt trotz Tempo nicht als harte Einheit (Schwimmen im Triathlon: geringe orthopädische Last) */
  soft?: boolean
}

const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b))

/** Ordnet Einheiten Wochentagen zu (0 = Montag): harte Einheiten möglichst weit auseinander, die lange ans Wochenende. */
export function assignDays(slots: Slot[], days: number[], avoidHard: number[] = []): number[] {
  const avail = [...new Set(days)].sort((a, b) => a - b)
  if (avail.length === 0) return slots.map(() => 0)
  const result = new Array<number>(slots.length).fill(-1)
  const hardIdx = slots.map((s, i) => (s.hard || s.long ? i : -1)).filter((i) => i >= 0).slice(0, avail.length)
  let best = -Infinity
  let bestPick: number[] = []
  const pick: number[] = []
  const used = new Set<number>()
  const rec = (k: number) => {
    if (k === hardIdx.length) {
      let score = 0
      let min = 7
      for (let a = 0; a < pick.length; a++) for (let b = a + 1; b < pick.length; b++) min = Math.min(min, gap(pick[a], pick[b]))
      score += (pick.length > 1 ? min : 3) * 10
      for (let a = 0; a < pick.length; a++)
        for (let b = a + 1; b < pick.length; b++) if (slots[hardIdx[a]].hard && slots[hardIdx[b]].hard && gap(pick[a], pick[b]) < 2) score -= 60
      pick.forEach((d, j) => {
        const s = slots[hardIdx[j]]
        if (s.long) score += d === 6 ? 6 : d === 5 ? 5 : 0
        else if (d >= 1 && d <= 3) score += 1
        if (avoidHard.includes(d)) score -= 25
        else if (avoidHard.some((x) => gap(x, d) === 1)) score -= 6
        score -= d * 0.01
      })
      if (score > best) {
        best = score
        bestPick = [...pick]
      }
      return
    }
    for (const d of avail) {
      if (used.has(d)) continue
      used.add(d)
      pick.push(d)
      rec(k + 1)
      pick.pop()
      used.delete(d)
    }
  }
  rec(0)
  hardIdx.forEach((i, j) => (result[i] = bestPick[j]))
  const count = new Map<number, number>()
  bestPick.forEach((d) => count.set(d, 1))
  slots.forEach((s, i) => {
    if (result[i] >= 0) return
    const free = avail.filter((d) => !count.has(d))
    let day: number
    if (free.length) {
      const taken = [...count.keys()]
      day = free.reduce((bestDay, d) => {
        const dist = (x: number) => (taken.length ? Math.min(...taken.map((t) => gap(t, x))) : 7)
        return dist(d) > dist(bestDay) ? d : bestDay
      }, free[0])
    } else {
      const hardDays = new Set(bestPick)
      const cand = avail.filter((d) => !hardDays.has(d))
      const pool = cand.length ? cand : avail
      day = pool.reduce((b, d) => ((count.get(d) ?? 0) < (count.get(b) ?? 0) ? d : b), pool[0])
    }
    result[i] = day
    count.set(day, (count.get(day) ?? 0) + 1)
  })
  return result
}

// ---------- Wochen je Sportart ----------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const round5 = (x: number) => Math.round(x / 5) * 5
const L = <T,>(arr: [T, T, T], level: Level) => arr[level]

function qualityCount(n: number, w: WeekInfo): number {
  if (w.focus === 'base') return 0
  let q = n <= 1 ? 0 : n <= 4 ? 1 : 2
  if (w.focus === 'long') q = Math.min(q, 1)
  if (w.deload || w.taper) q = Math.min(q, 1)
  return q
}

function runTypes(cfg: PlanConfig, w: WeekInfo): [string, string] {
  const f = w.focus
  if (f === 'intervals') return ['intervals', 'intervals']
  if (f === 'threshold') return ['threshold', 'threshold']
  if (f === 'tempo') return ['tempo', 'threshold']
  if (f === 'hills') return ['hills', 'threshold']
  const ph = w.phase === 'taper' ? 'peak' : w.phase
  const map: Record<string, Record<string, [string, string]>> = {
    '5k': { base: ['hills', 'threshold'], build: ['intervals', 'threshold'], peak: ['intervals', 'tempo'] },
    '10k': { base: ['threshold', 'hills'], build: ['intervals', 'threshold'], peak: ['tempo', 'intervals'] },
    half: { base: ['threshold', 'hills'], build: ['threshold', 'intervals'], peak: ['tempo', 'threshold'] },
    marathon: { base: ['threshold', 'hills'], build: ['threshold', 'tempo'], peak: ['tempo', 'threshold'] },
    ultra: { base: ['intervals', 'hills'], build: ['threshold', 'hills'], peak: ['tempo', 'hills'] },
    fitness: { base: ['hills', 'threshold'], build: ['threshold', 'intervals'], peak: ['intervals', 'threshold'] },
  }
  const key = isUltra(cfg) ? 'ultra' : map[cfg.goal] ? cfg.goal : 'fitness'
  const t = map[key][ph]
  if (cfg.terrain === 'hilly' && !t.includes('hills')) return [t[0], 'hills']
  return t
}

function runQualitySpec(type: string, cfg: PlanConfig, w: WeekInfo): SessionSpec {
  const lv = cfg.level
  const cut = w.deload ? 0.6 : w.taper ? 0.5 : 1
  if (type === 'intervals') {
    const total = Math.min(Math.max(1600, w.volume * 80), lerp(L([2000, 3000, 4000], lv), L([3200, 4800, 6000], lv), w.prog)) * cut
    const dists = lv === 0 ? [400, 600, 800] : lv === 1 ? [600, 800, 1000] : [800, 1000, 1200]
    const dist = dists[w.index % 3]
    return { builder: 'run.intervals', p: { reps: Math.min(12, Math.max(3, Math.round(total / dist))), dist } }
  }
  if (type === 'tempo') {
    const key = cfg.goal === 'marathon' || isUltra(cfg) ? 'M' : cfg.goal === 'half' ? 'HM' : cfg.goal === '5k' ? '5k' : cfg.goal === '10k' ? '10k' : 'HM'
    const range: Record<string, [[number, number, number], [number, number, number], number]> = {
      M: [[6, 8, 10], [12, 14, 18], 5],
      HM: [[4, 5, 6], [8, 10, 12], 3],
      '10k': [[3, 4, 5], [5, 6, 8], 2],
      '5k': [[2, 2.5, 3], [3, 4, 5], 1],
    }
    const [lo, hi, repKm] = range[key]
    const total = lerp(L(lo, lv), L(hi, lv), w.prog) * cut
    const km = raceKm(cfg)
    const goalPace = cfg.targetTimeSec && km && !isUltra(cfg) ? cfg.targetTimeSec / km : undefined
    if (key === 'M' && total <= 10) return { builder: 'run.tempo', p: { reps: 1, repKm: Math.max(3, Math.round(total)), pace: key, goalPace } }
    return { builder: 'run.tempo', p: { reps: Math.max(2, Math.round(total / repKm)), repKm, pace: key, goalPace } }
  }
  if (type === 'hills') {
    const reps = Math.round(lerp(L([5, 6, 8], lv), L([8, 10, 12], lv), w.prog) * cut)
    return { builder: 'run.hills', p: { reps: Math.max(3, reps), repSec: lv === 0 ? (w.index % 2 ? 60 : 45) : w.index % 2 ? 90 : 60, down: cfg.terrain === 'hilly' && w.index % 2 === 1 } }
  }
  const total = lerp(L([15, 20, 25], lv), L([25, 32, 40], lv), w.prog) * cut
  if (w.index % 2 === 0) {
    const rep = L([5, 6, 8], lv)
    return { builder: 'run.threshold', p: { reps: Math.max(2, Math.round(total / rep)), repMin: rep } }
  }
  return { builder: 'run.threshold', p: { reps: 1, repMin: Math.max(10, round5(total * 0.8)) } }
}

const LONG_CAP_RUN: Record<string, [number, number, number]> = {
  '5k': [12, 15, 18],
  '10k': [15, 18, 22],
  half: [19, 22, 25],
  marathon: [30, 32, 35],
  ultra50: [34, 38, 42],
  ultra100: [40, 45, 50],
  ultra: [38, 42, 46],
  fitness: [14, 18, 22],
}

function sessionCount(cfg: PlanConfig, w: WeekInfo): number {
  const n = cfg.sessionsPerWeek
  return (w.deload || w.taper) && n >= 5 ? n - 1 : n
}

function runWeek(cfg: PlanConfig, w: WeekInfo, ctx: BuildCtx): Slot[] {
  const n = sessionCount(cfg, w)
  const slots: Slot[] = []
  const q = qualityCount(n, w)
  const [prim, sec] = runTypes(cfg, w)
  let rest = w.volume
  for (let k = 0; k < q; k++) {
    const type = q === 1 ? (w.index % 3 === 2 ? sec : prim) : k === 0 ? prim : sec
    const spec = runQualitySpec(type, cfg, w)
    const km = build(spec, ctx).distanceKm ?? 0
    // Bei sehr kleinem Wochenumfang wäre die Tempoeinheit fast die halbe Woche: dann lieber locker mit Steigerungen
    if (km > w.volume * 0.4) continue
    rest -= km
    slots.push({ spec, hard: true, key: k === 0 })
  }
  const hasLong = n >= 2
  const easyCount = n - slots.length - (hasLong ? 1 : 0)
  if (hasLong) {
    const share = (n <= 2 ? 0.6 : n === 3 ? 0.42 : n === 4 ? 0.35 : 0.3) + (w.focus === 'long' ? 0.08 : 0)
    const cap = L(LONG_CAP_RUN[cfg.goal] ?? LONG_CAP_RUN.fitness, cfg.level)
    let km = Math.max(4, Math.min(cap, w.volume * share))
    if (easyCount === 0) km = Math.max(4, Math.min(cap, rest))
    km = Math.round(km)
    const hillFactor = cfg.terrain === 'hilly' ? 30 : cfg.terrain === 'rolling' ? 15 : 0
    const elev = hillFactor ? Math.round((km * hillFactor) / 50) * 50 : 0
    let spec: SessionSpec
    if (isUltra(cfg) && (cfg.terrain !== 'flat' || km >= 28)) {
      spec = { builder: 'run.long', p: { byTime: true, min: round5((km * ctx.paces.E[0] * (elev ? 1.15 : 1.05)) / 60), elev } }
    } else {
      const fin = cfg.goal === 'marathon' && w.phase === 'peak' && cfg.level >= 1 && !w.deload && w.index % 2 === 0 ? Math.round(km * 0.3) : 0
      spec = { builder: 'run.long', p: { km, elev, mFinishKm: fin } }
    }
    rest -= build(spec, ctx).distanceKm ?? km
    slots.push({ spec, long: true, key: true })
  }
  for (let k = 0; k < easyCount; k++) {
    const km = Math.max(3, Math.round((rest / easyCount) * 2) / 2)
    if (k === easyCount - 1 && easyCount >= 3) slots.push({ spec: { builder: 'run.recovery', p: { km: Math.max(3, Math.round(km * 0.7)) } } })
    else slots.push({ spec: { builder: 'run.easy', p: { km, strides: k === 0 && (!slots.some((x) => x.hard) || w.phase === 'base'), hilly: cfg.terrain !== 'flat' && k === 1 } } })
  }
  if (n === 1) slots.push({ spec: { builder: 'run.easy', p: { km: Math.max(3, Math.round(w.volume)) } }, key: true })
  return slots
}

function bikeTypes(cfg: PlanConfig, w: WeekInfo): [string, string] {
  const f = w.focus
  if (f === 'intervals') return ['vo2', 'vo2']
  if (f === 'threshold') return ['threshold', 'threshold']
  if (f === 'tempo') return ['sweetspot', 'threshold']
  if (f === 'hills') return ['hills', 'threshold']
  const hilly = cfg.terrain === 'hilly'
  if (w.phase === 'base') return ['sweetspot', cfg.terrain === 'flat' ? 'sweetspot' : 'hills']
  if (w.phase === 'build') return ['threshold', hilly ? 'hills' : 'vo2']
  return ['threshold', hilly ? 'hills' : 'sweetspot']
}

export function bikeQualitySpec(type: string, cfg: PlanConfig, w: WeekInfo, fillMin = 0): SessionSpec {
  const lv = cfg.level
  const cut = w.deload ? 0.6 : w.taper ? 0.5 : 1
  const mk = (builder: string, lo: [number, number, number], hi: [number, number, number], rep: number): SessionSpec => {
    const total = lerp(L(lo, lv), L(hi, lv), w.prog) * cut
    return { builder, p: { reps: Math.max(builder === 'bike.vo2' ? 3 : 2, Math.round(total / rep)), repMin: rep, fillMin } }
  }
  if (type === 'vo2') return mk('bike.vo2', [9, 12, 16], [15, 20, 25], lv === 0 ? 3 : w.index % 2 ? 4 : 5)
  if (type === 'hills') return mk('bike.hills', [15, 20, 24], [24, 32, 40], lv === 0 ? 5 : 8)
  if (type === 'threshold') return mk('bike.threshold', [16, 24, 30], [30, 40, 60], cfg.terrain === 'hilly' && lv > 0 ? 20 : L([8, 12, 15], lv))
  return mk('bike.sweetspot', [20, 30, 40], [40, 60, 75], L([10, 15, 20], lv))
}

function bikeLongCap(cfg: PlanConfig): number {
  const caps: Record<string, number> = { '50k': 150, '100k': 270, '200k': 420, multi: 300, fitness: 180 }
  if (cfg.distanceKm) return Math.max(90, Math.round((cfg.distanceKm / 25) * 60 * 0.85))
  return caps[cfg.goal] ?? 180
}

function bikeWeek(cfg: PlanConfig, w: WeekInfo, ctx: BuildCtx): Slot[] {
  const n = sessionCount(cfg, w)
  const total = w.volume * 60
  const slots: Slot[] = []
  const q = qualityCount(n, w)
  const [prim, sec] = bikeTypes(cfg, w)
  let rest = total
  const hasLong = n >= 2
  const share = (n <= 2 ? 0.6 : n === 3 ? 0.45 : n === 4 ? 0.4 : 0.35) + (w.focus === 'long' ? 0.08 : 0)
  const longMin = hasLong ? Math.max(45, round5(Math.min(bikeLongCap(cfg), total * share))) : 0
  const target = n > 1 ? (total - longMin) / (n - 1) : total
  for (let k = 0; k < q; k++) {
    const type = q === 1 ? (w.index % 3 === 2 ? sec : prim) : k === 0 ? prim : sec
    let spec = bikeQualitySpec(type, cfg, w)
    const base = build(spec, ctx).durationMin
    const fill = Math.min(60, Math.max(0, round5(target - base)))
    if (fill >= 10) spec = bikeQualitySpec(type, cfg, w, fill)
    rest -= build(spec, ctx).durationMin
    slots.push({ spec, hard: true, key: k === 0 })
  }
  if (hasLong) {
    const perHour = cfg.terrain === 'hilly' ? 400 : cfg.terrain === 'rolling' ? 200 : 0
    slots.push({ spec: { builder: 'bike.long', p: { min: longMin, elev: Math.round(((longMin / 60) * perHour) / 100) * 100 } }, long: true, key: true })
    rest -= longMin
  }
  const easyCount = n - q - (hasLong ? 1 : 0)
  for (let k = 0; k < easyCount; k++) {
    const min = Math.max(30, round5(rest / easyCount))
    slots.push({ spec: k === easyCount - 1 && easyCount >= 3 ? { builder: 'bike.recovery', p: { min: Math.max(30, round5(min * 0.7)) } } : { builder: 'bike.easy', p: { min } } })
  }
  if (n === 1) slots.push({ spec: { builder: 'bike.easy', p: { min: Math.max(30, round5(total)) } }, key: true })
  return slots
}

function swimWeek(cfg: PlanConfig, w: WeekInfo): Slot[] {
  const n = sessionCount(cfg, w)
  const cycles: Record<string, string[]> = {
    technique: ['technique', 'endurance', 'technique', 'endurance', 'technique'],
    '400': ['threshold', 'speed', 'technique', 'endurance', 'threshold'],
    '1500': ['threshold', 'endurance', 'technique', 'speed', 'endurance'],
    '3800': ['endurance', 'threshold', 'technique', 'endurance', 'open'],
    open: ['open', 'threshold', 'endurance', 'technique', 'endurance'],
  }
  let types = (cycles[cfg.goal] ?? cycles.technique).slice(0, n)
  while (types.length < n) types.push('endurance')
  const f = w.focus
  if (f === 'base') types = types.map((t) => (t === 'threshold' || t === 'speed' ? 'endurance' : t))
  if (f === 'intervals') types = types.map((t, i) => (i % 2 === 0 ? 'speed' : t === 'threshold' ? 'endurance' : t))
  if (f === 'threshold') types = types.map((t, i) => (i % 2 === 0 ? 'threshold' : t === 'speed' ? 'endurance' : t))
  if (f === 'long') types = types.map((t, i) => (i === 0 ? 'endurance' : t))
  if (cfg.level === 0 && w.phase === 'base') types = types.map((t) => (t === 'speed' ? 'technique' : t))
  if (w.deload || w.taper) {
    let seen = false
    types = types.map((t) => {
      if (t !== 'threshold' && t !== 'speed') return t
      if (seen) return 'technique'
      seen = true
      return t
    })
  }
  const per = (w.volume * 1000) / n
  return types.map((t, i) => ({
    spec: { builder: `swim.${t}`, p: { m: Math.round((per * (n > 1 ? (i === 0 ? 1.15 : 1 - 0.15 / (n - 1)) : 1)) / 100) * 100 } },
    hard: t === 'threshold' || t === 'speed',
    key: i === 0,
  }))
}

const TRI_IDX: Record<string, number> = { sprint: 0, olympic: 1, half: 2, full: 3 }
const TRI_LAYOUT: Record<number, string[]> = {
  3: ['swim', 'run', 'brick'],
  4: ['swim', 'bike', 'run', 'brick'],
  5: ['swim', 'swim', 'bike', 'run', 'brick'],
  6: ['swim', 'swim', 'bike', 'run', 'run', 'brick'],
  7: ['swim', 'swim', 'bike', 'bike', 'run', 'run', 'brick'],
  8: ['swim', 'swim', 'swim', 'bike', 'bike', 'run', 'run', 'brick'],
  9: ['swim', 'swim', 'swim', 'bike', 'bike', 'run', 'run', 'run', 'brick'],
}

function triWeek(cfg: PlanConfig, w: WeekInfo, ctx: BuildCtx): Slot[] {
  const n = Math.min(9, Math.max(3, sessionCount(cfg, w)))
  const layout = TRI_LAYOUT[n]
  const d = TRI_IDX[cfg.goal] ?? 1
  const lv = cfg.level
  const T = w.volume * 60
  const swimMin = T * 0.18
  const bikeMin = T * 0.5
  const runMin = T * 0.32
  const ns = layout.filter((x) => x === 'swim').length
  const nb = layout.filter((x) => x === 'bike').length
  const nr = layout.filter((x) => x === 'run').length
  const slots: Slot[] = []
  const easyPace = (ctx.paces.E[0] + ctx.paces.E[1]) / 2
  const allowHard = !(lv === 0 && w.phase === 'base') && w.focus !== 'base'
  let hardLeft = w.deload || w.taper ? 1 : lv === 0 ? 1 : 2

  // Koppeleinheit
  const brickCap = [90, 150, 240, 330][d]
  const brickBike = Math.max(40, round5(Math.min(brickCap, bikeMin * (nb === 0 ? 1 : nb === 1 ? 0.6 : 0.5))))
  const brickRun = Math.max(10, round5([15, 20, 30, 40][d] * (w.phase === 'base' ? 0.6 : 1) * (w.deload || w.taper ? 0.6 : 1)))
  const brickHard = w.phase === 'peak' && lv > 0 && !w.deload && w.focus !== 'base'
  if (brickHard) hardLeft--
  slots.push({ spec: { builder: 'tri.brick', p: { bikeMin: brickBike, runMin: brickRun, hard: brickHard } }, long: true, hard: brickHard, key: true })

  // Rad
  let bikeRest = bikeMin - brickBike
  for (let k = 0; k < nb; k++) {
    const share = Math.max(40, round5(bikeRest / (nb - k)))
    if (k === 0 && allowHard && hardLeft > 0) {
      const type = w.phase === 'base' ? 'sweetspot' : w.phase === 'build' ? (d <= 1 && w.index % 2 ? 'vo2' : 'threshold') : d <= 1 ? 'threshold' : 'sweetspot'
      let spec = bikeQualitySpec(type, cfg, w)
      const fill = Math.min(60, Math.max(0, round5(share - build(spec, ctx).durationMin)))
      if (fill >= 10) spec = bikeQualitySpec(type, cfg, w, fill)
      slots.push({ spec, hard: true })
      hardLeft--
      bikeRest -= build(spec, ctx).durationMin
    } else {
      slots.push({ spec: { builder: 'bike.easy', p: { min: share } } })
      bikeRest -= share
    }
  }

  // Laufen
  const runCap = [60, 90, 120, 165][d]
  let runRest = Math.max(20, runMin - brickRun)
  for (let k = 0; k < nr; k++) {
    if (k === 0) {
      const min = Math.max(25, round5(Math.min(runCap, runRest * (nr >= 2 ? 0.58 : 1))))
      const km = Math.max(4, Math.round((min * 60) / easyPace))
      slots.push({ spec: { builder: 'run.long', p: { km } }, long: nr >= 2 || d >= 2, key: true })
      runRest -= min
    } else if (k === 1 && allowHard && hardLeft > 0 && lv > 0) {
      const sub: PlanConfig = { ...cfg, sport: 'run', goal: d <= 1 ? '10k' : d === 2 ? 'half' : 'marathon' }
      const type = w.phase === 'base' ? 'hills' : d <= 1 && w.phase === 'build' ? 'intervals' : 'threshold'
      const spec = runQualitySpec(type, sub, { ...w, volume: (runMin * 60) / easyPace })
      slots.push({ spec, hard: true })
      hardLeft--
      runRest -= build(spec, ctx).durationMin
    } else {
      const min = Math.max(25, runRest / (nr - k))
      slots.push({ spec: { builder: 'run.easy', p: { km: Math.max(4, Math.round((min * 60) / easyPace)), strides: k === 1 } } })
      runRest -= min
    }
  }

  // Schwimmen
  const swimCap = [2000, 2800, 3600, 4200][d]
  for (let k = 0; k < ns; k++) {
    const m = Math.min(swimCap, Math.max(1000, Math.round((((swimMin / ns) * 60) / (ctx.css + 12)) * 100 / 100) * 100))
    const type = k === 0 ? (allowHard ? 'threshold' : 'endurance') : k === 1 ? (w.phase === 'base' ? 'technique' : 'endurance') : w.phase === 'base' ? 'technique' : 'open'
    slots.push({ spec: { builder: `swim.${type}`, p: { m } }, stackable: true, soft: true })
  }
  return slots
}

function gymFocus(cfg: PlanConfig, w: WeekInfo, k: number): Focus {
  if (w.focus !== 'mixed') return w.focus
  if (cfg.goal === 'maxStrength' || cfg.goal === 'endurance') return 'maxStrength'
  if (cfg.goal === 'hypertrophy') return 'hypertrophy'
  if (cfg.goal === 'strengthEndurance') return 'strengthEndurance'
  return (['maxStrength', 'hypertrophy', 'strengthEndurance'] as Focus[])[k % 3]
}

function gymWeek(cfg: PlanConfig, w: WeekInfo): Slot[] {
  const n = cfg.sessionsPerWeek
  const rot = gymRotation(cfg.split ?? 'full', w.focus, cfg.goal, n)
  // Der geplante Umfang trägt die Entlastung schon in sich; der Baustein kürzt selbst, daher hier der Aufbauwert.
  const sets = (w.deload ? w.volume / DELOAD_FACTOR : w.volume) / n
  return Array.from({ length: n }, (_, k) => ({
    spec: {
      builder: 'gym.session',
      p: { day: rot[(w.index * n + k) % rot.length], focus: gymFocus(cfg, w, k), sets: Math.round(sets), week: w.blockWeek, block: w.block, deload: w.deload || w.taper },
    },
    hard: true,
    key: k === 0,
  }))
}

export function weekSlots(cfg: PlanConfig, w: WeekInfo, ctx: BuildCtx): Slot[] {
  switch (cfg.sport) {
    case 'run':
      return runWeek(cfg, w, ctx)
    case 'bike':
      return bikeWeek(cfg, w, ctx)
    case 'swim':
      return swimWeek(cfg, w)
    case 'tri':
      return triWeek(cfg, w, ctx)
    case 'gym':
      return gymWeek(cfg, w)
  }
}

function raceSpec(cfg: PlanConfig): SessionSpec | undefined {
  const km = raceKm(cfg)
  if (cfg.sport === 'run') return { builder: 'run.race', p: { km: km ?? 10, goalSec: cfg.targetTimeSec } }
  if (cfg.sport === 'bike') return { builder: 'bike.race', p: { km: km ?? 100 } }
  if (cfg.sport === 'tri') {
    const names: Record<string, string> = { sprint: 'Sprintdistanz', olympic: 'Olympische Distanz', half: 'Mitteldistanz', full: 'Langdistanz' }
    const mins: Record<string, number> = { sprint: 90, olympic: 180, half: 360, full: 780 }
    return {
      builder: 'any.race',
      p: { discipline: 'bike', title: `Wettkampf ${names[cfg.goal] ?? 'Triathlon'}`, min: cfg.targetTimeSec ? cfg.targetTimeSec / 60 : mins[cfg.goal] ?? 180, text: 'Schwimmen ruhig beginnen, auf dem Rad gleichmäßig bei {pw:70-85} bleiben und früh essen. Beim Laufen die ersten 2 km bewusst zurückhalten' },
    }
  }
  if (cfg.sport === 'swim') return { builder: 'any.race', p: { discipline: 'swim', title: 'Zieltag Schwimmen', min: 45, text: 'Die erste Hälfte kontrolliert, dann gleichmäßig steigern' } }
  return undefined
}

/** Erzeugt alle Einheiten eines Plans. Reine Funktion: gleiche Eingabe, gleiches Ergebnis. */
export function generatePlan(planId: string, cfg: PlanConfig, ctx: BuildCtx, weekStart = 0): Session[] {
  const sessions: Session[] = []
  const days = cfg.days.length ? cfg.days : [1, 3, 5]
  for (const w of planWeeks(cfg)) {
    const slots = weekSlots(cfg, w, ctx)
    const assigned = assignDays(slots, days, cfg.avoidHardDays)
    const perDay = new Map<number, number>()
    slots.forEach((slot, k) => {
      const b = build(slot.spec, ctx)
      const dayIdx = assigned[k]
      const offset = (dayIdx - weekStart + 7) % 7
      const date = addDays(w.start, offset)
      const c = perDay.get(dayIdx) ?? 0
      perDay.set(dayIdx, c + 1)
      sessions.push({
        id: `${planId}:${w.index}:${k}`,
        planId,
        weekIndex: w.index,
        date,
        ...b,
        hard: slot.soft ? false : b.hard,
        key: !!slot.key,
        deload: w.deload,
        taper: w.taper || undefined,
        spec: slot.spec,
        status: 'planned',
        timeOfDay: c > 0 ? 'abends' : undefined,
      })
    })
  }
  if (cfg.raceDate) {
    const spec = raceSpec(cfg)
    const last = planWeeks(cfg)[cfg.weeks - 1]
    const kept = sessions.filter((s) => s.date < addDays(cfg.raceDate!, -1))
    if (spec && last) {
      const b = build(spec, ctx)
      kept.push({ id: `${planId}:${last.index}:race`, planId, weekIndex: last.index, date: cfg.raceDate, ...b, key: true, deload: false, taper: true, spec, status: 'planned' })
    }
    return kept.sort((a, b) => a.date.localeCompare(b.date))
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date))
}

/** Umfang einer Einheit in der Einheit des Plans */
export function sessionVolume(sport: Sport, s: Pick<Session, 'discipline' | 'distanceKm' | 'durationMin' | 'gym' | 'kind'>): number {
  if (s.kind === 'race') return 0
  if (sport === 'run') return s.discipline === 'run' ? (s.distanceKm ?? 0) : 0
  if (sport === 'swim') return s.discipline === 'swim' ? (s.distanceKm ?? 0) : 0
  if (sport === 'gym') return (s.gym ?? []).reduce((a, g) => a + g.sets, 0)
  return s.durationMin / 60
}

export interface WeekSummary extends WeekInfo {
  actual: number
  minutes: number
  load: number
  count: number
  hard: number
}

export function summarize(cfg: PlanConfig, sessions: Session[]): WeekSummary[] {
  return planWeeks(cfg).map((w) => {
    const ss = sessions.filter((s) => s.weekIndex === w.index)
    return {
      ...w,
      actual: ss.reduce((a, s) => a + sessionVolume(cfg.sport, s), 0),
      minutes: ss.reduce((a, s) => a + s.durationMin, 0),
      load: ss.reduce((a, s) => a + s.load, 0),
      count: ss.length,
      hard: ss.filter((s) => s.hard).length,
    }
  })
}

/** Startdatum so, dass die letzte Woche den Wettkampftag enthält */
export function startForRace(raceDate: string, weeks: number, weekStart = 0): string {
  return addDays(startOfWeek(raceDate, weekStart), -(weeks - 1) * 7)
}

export function weeksUntil(raceDate: string, from: string, weekStart = 0): number {
  return Math.floor(diffDays(startOfWeek(raceDate, weekStart), startOfWeek(from, weekStart)) / 7) + 1
}

export { weekday }
