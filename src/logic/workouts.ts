// Bausteine für einzelne Einheiten. Jede Einheit entsteht aus einer Bauanleitung (SessionSpec),
// damit sie später abgeschwächt, ersetzt oder neu berechnet werden kann.
import { fmtDuration, fmtTime } from './dates'
import { GYM_DAYS, exerciseById } from './exercises'
import { plannedLoad } from './load'
import type { Discipline, Focus, GymSet, Kind, Session, SessionSpec, Step } from './types'
import type { Paces } from './zones'

export interface BuildCtx {
  paces: Paces
  /** s/100 m */
  css: number
}

export type Built = Pick<Session, 'discipline' | 'kind' | 'title' | 'steps' | 'durationMin' | 'load' | 'hard'> &
  Partial<Pick<Session, 'distanceKm' | 'elevationM' | 'gym' | 'heavyLegs'>>

const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d)
const r1 = (x: number) => Math.round(x * 10) / 10
const km = (x: number) => `${r1(x).toLocaleString('de-DE')} km`
const eMid = (p: Paces) => (p.E[0] + p.E[1]) / 2
const S = (part: Step['part'], text: string): Step => ({ part, text })

function out(discipline: Discipline, kind: Kind, title: string, steps: Step[], durationMin: number, hard: boolean, extra: Partial<Built> = {}): Built {
  const d = Math.max(10, Math.round(durationMin))
  return { discipline, kind, title, steps, durationMin: d, load: plannedLoad(kind, d), hard, ...extra }
}

const RACE_PACE_LABEL: Record<string, string> = { M: 'Marathontempo', HM: 'Halbmarathontempo', '10k': '10-km-Tempo', '5k': '5-km-Tempo' }

type P = SessionSpec['p']
const builders: Record<string, (p: P, c: BuildCtx) => Built> = {
  // ---------- Laufen ----------
  'run.easy': (p, c) => {
    const d = n(p.km, 6)
    const min = (d * eMid(c.paces)) / 60
    const steps = [S('Hauptteil', `${km(d)} gleichmäßig bei {pace:E}, {hr:1-2}`)]
    if (p.strides) steps.push(S('Auslaufen', 'Zum Schluss 4 × 20 s Steigerungslauf auf flacher Strecke, dazwischen 60 s gehen'))
    if (p.hilly) steps.push(S('Hinweis', 'Auf welliger Strecke laufen, bergauf das Tempo herausnehmen und den Puls halten'))
    return out('run', 'easy', `Lockerer Dauerlauf ${km(d)}`, steps, min, false, { distanceKm: r1(d) })
  },
  'run.recovery': (p, c) => {
    const d = n(p.km, 4)
    return out('run', 'recovery', `Regenerationslauf ${km(d)}`, [S('Hauptteil', `${km(d)} sehr locker, {hr:1}. Langsamer als gewohnt ist richtig`)], (d * c.paces.E[0]) / 60, false, { distanceKm: r1(d) })
  },
  'run.long': (p, c) => {
    const elev = n(p.elev)
    if (p.byTime) {
      const min = n(p.min, 120)
      const d = (min * 60) / (c.paces.E[0] * (elev ? 1.15 : 1.05))
      const steps = [
        S('Hauptteil', `${fmtDuration(min)} im Gelände bei {hr:1-2}. Die Zeit zählt, nicht die Strecke`),
        S('Hinweis', `${elev ? `Etwa ${elev} Höhenmeter einbauen, steile Anstiege zügig gehen. ` : ''}Alle 30 min essen und trinken wie im Wettkampf geplant`),
      ]
      return out('run', 'long', `Langer Lauf ${fmtDuration(min)}`, steps, min, false, { distanceKm: r1(d), elevationM: elev || undefined })
    }
    const d = n(p.km, 16)
    const fin = n(p.mFinishKm)
    const min = ((d - fin) * eMid(c.paces) + fin * c.paces.M) / 60
    const steps = [S('Hauptteil', fin ? `${km(d - fin)} bei {pace:E}, {hr:2}, danach ${km(fin)} bei {pace:M}` : `${km(d)} gleichmäßig bei {pace:E}, {hr:2}`)]
    if (elev) steps.push(S('Hinweis', `Strecke mit etwa ${elev} Höhenmetern wählen. Bergauf Puls halten, bergab locker rollen lassen`))
    if (d >= 18) steps.push(S('Hinweis', 'Ab 60 min regelmäßig trinken und Kohlenhydrate zuführen'))
    return out('run', 'long', `Langer Lauf ${km(d)}`, steps, min, false, { distanceKm: r1(d), elevationM: elev || undefined })
  },
  'run.threshold': (p, c) => {
    const reps = Math.max(1, Math.round(n(p.reps, 1)))
    const rep = n(p.repMin, 20)
    const rest = rep >= 10 ? 3 : 2
    const min = 15 + reps * rep + (reps - 1) * rest + 10
    const d = ((25 + (reps - 1) * rest) * 60) / eMid(c.paces) + (reps * rep * 60) / c.paces.T
    const main = reps === 1 ? `${rep} min durchgehend bei {pace:T}, {hr:4}` : `${reps} × ${rep} min bei {pace:T}, {hr:4}, dazwischen ${rest} min traben`
    const title = reps === 1 ? `Tempodauerlauf ${rep} min an der Schwelle` : `${reps} × ${rep} min an der Schwelle, ${rest} min Trabpause`
    return out('run', 'threshold', title, [S('Aufwärmen', '15 min locker einlaufen, {hr:1-2}, dazu 3 kurze Steigerungen'), S('Hauptteil', main), S('Auslaufen', '10 min locker auslaufen')], min, true, { distanceKm: r1(d) })
  },
  'run.intervals': (p, c) => {
    const reps = Math.max(2, Math.round(n(p.reps, 5)))
    const dist = n(p.dist, 800)
    const work = (dist / 1000) * c.paces.I
    const rest = Math.min(180, Math.max(60, Math.round(work / 30) * 30))
    const restTxt = rest % 60 === 0 ? `${rest / 60} min` : `${fmtTime(rest)} min`
    const min = 15 + (reps * work + (reps - 1) * rest) / 60 + 10
    const d = (25 * 60 + (reps - 1) * rest * 0.6) / eMid(c.paces) + (reps * dist) / 1000
    return out(
      'run',
      'intervals',
      `${reps} × ${dist} m im Intervalltempo, ${restTxt} Trabpause`,
      [
        S('Aufwärmen', '15 min locker einlaufen, {hr:1-2}, dazu 4 Steigerungen über 80 m'),
        S('Hauptteil', `${reps} × ${dist} m bei {pace:I}, dazwischen ${restTxt} locker traben. Der Puls erreicht erst gegen Ende jeder Wiederholung {hr:5}`),
        S('Auslaufen', '10 min locker auslaufen'),
      ],
      min,
      true,
      { distanceKm: r1(d) },
    )
  },
  'run.tempo': (p, c) => {
    const reps = Math.max(1, Math.round(n(p.reps, 1)))
    const rep = n(p.repKm, 5)
    const key = String(p.pace ?? 'M')
    const goalPace = n(p.goalPace)
    const paceSec = goalPace || (key === 'M' ? c.paces.M : key === 'HM' ? (c.paces.M + c.paces.T) / 2 : c.paces.T * 0.98)
    const target = goalPace ? `${fmtTime(goalPace)} min/km (Zieltempo)` : `{pace:${key}}`
    const min = 12 + (reps * rep * paceSec) / 60 + (reps - 1) * 3 + 10
    const d = ((22 + (reps - 1) * 3) * 60) / eMid(c.paces) + reps * rep
    const main = reps === 1 ? `${km(rep)} durchgehend bei ${target}` : `${reps} × ${km(rep)} bei ${target}, dazwischen 3 min traben`
    const title = reps === 1 ? `${km(rep)} im ${RACE_PACE_LABEL[key]}` : `${reps} × ${km(rep)} im ${RACE_PACE_LABEL[key]}, 3 min Trabpause`
    return out('run', 'tempo', title, [S('Aufwärmen', '12 min locker einlaufen, {hr:1-2}'), S('Hauptteil', main), S('Auslaufen', '10 min locker auslaufen')], min, true, { distanceKm: r1(d) })
  },
  'run.hills': (p, c) => {
    const reps = Math.max(3, Math.round(n(p.reps, 8)))
    const sec = n(p.repSec, 60)
    const min = 15 + (reps * sec * 2.6) / 60 + 10
    const d = (min * 60) / (eMid(c.paces) * 1.08)
    const steps = [
      S('Aufwärmen', '15 min locker einlaufen bis zum Anstieg, {hr:1-2}'),
      S('Hauptteil', `${reps} × ${sec} s bergauf an einem gleichmäßigen Anstieg (5 bis 8 % Steigung), kräftig und aufrecht, Anstrengung wie im 5-km-Rennen. Locker zurücktraben als Pause`),
    ]
    if (p.down) steps.push(S('Hauptteil', '4 × 2 min bergab auf mäßigem Gefälle: kurze, schnelle Schritte, Oberkörper leicht nach vorn. Gewöhnt die Beine an das Bergablaufen'))
    steps.push(S('Auslaufen', '10 min locker auslaufen'))
    return out('run', 'hills', `${reps} × ${sec} s Bergläufe${p.down ? ' und Bergab-Technik' : ''}`, steps, min + (p.down ? 12 : 0), true, { distanceKm: r1(d), elevationM: Math.round(reps * sec * 0.22) })
  },
  'run.race': (p) => {
    const d = n(p.km, 10)
    const goal = n(p.goalSec)
    return out(
      'run',
      'race',
      `Wettkampf ${km(d)}`,
      [
        S('Aufwärmen', d <= 21.1 ? '10 bis 15 min locker einlaufen, 3 Steigerungen' : 'Kurz einlaufen, 5 min genügen'),
        S('Hauptteil', goal ? `${km(d)} mit Zielzeit ${fmtTime(goal)}, das sind ${fmtTime(goal / d)} min/km. Die erste Hälfte nicht schneller als geplant` : `${km(d)}. Gleichmäßig beginnen, die zweite Hälfte nach Gefühl`),
      ],
      goal ? goal / 60 : d * 6,
      true,
      { distanceKm: r1(d) },
    )
  },
  // ---------- Rad ----------
  'bike.easy': (p) => {
    const min = n(p.min, 60)
    return out('bike', 'easy', `Grundlagenfahrt ${fmtDuration(min)}`, [S('Hauptteil', `${fmtDuration(min)} gleichmäßig bei {pw:56-75}, Trittfrequenz 85 bis 95`)], min, false)
  },
  'bike.recovery': (p) => {
    const min = n(p.min, 40)
    return out('bike', 'recovery', `Lockeres Ausrollen ${fmtDuration(min)}`, [S('Hauptteil', `${fmtDuration(min)} sehr locker bei {pw:40-55}, leichter Gang`)], min, false)
  },
  'bike.long': (p) => {
    const min = n(p.min, 150)
    const elev = n(p.elev)
    const steps = [S('Hauptteil', `${fmtDuration(min)} bei {pw:60-75}. Gleichmäßig fahren, auch an Wellen nicht überziehen`)]
    if (elev) steps.push(S('Hinweis', `Strecke mit etwa ${elev} Höhenmetern wählen. Anstiege im Sitzen bei {pw:76-90}`))
    steps.push(S('Hinweis', 'Pro Stunde 60 bis 80 g Kohlenhydrate und eine Flasche trinken'))
    return out('bike', 'long', `Lange Ausfahrt ${fmtDuration(min)}`, steps, min, false, { elevationM: elev || undefined })
  },
  'bike.sweetspot': (p) => bikeIv(p, 'tempo', 'Sweet Spot', '88-94', 5, 'bei'),
  'bike.threshold': (p) => bikeIv(p, 'threshold', 'an der Schwelle', '95-100', 5, 'bei'),
  'bike.vo2': (p) => bikeIv(p, 'intervals', 'VO2max', '106-120', n(p.repMin, 4), 'bei'),
  'bike.hills': (p) => {
    const b = bikeIv(p, 'hills', 'Kraftausdauer am Berg', '85-95', 5, 'bei')
    b.steps[1] = S('Hauptteil', `${b.steps[1].text}. Am Berg oder im schweren Gang im Sitzen, Trittfrequenz 55 bis 65, Oberkörper ruhig`)
    return b
  },
  'bike.race': (p) => {
    const d = n(p.km, 100)
    return out('bike', 'race', `Zieltag ${km(d)}`, [S('Hauptteil', `${km(d)}. Die erste Stunde bewusst zurückhalten, bei {pw:65-80} bleiben, früh essen und trinken`)], d * 2.4, true, { distanceKm: d })
  },
  // ---------- Schwimmen ----------
  'swim.technique': (p, c) => swim(p, c, 'technique'),
  'swim.endurance': (p, c) => swim(p, c, 'easy'),
  'swim.threshold': (p, c) => swim(p, c, 'threshold'),
  'swim.speed': (p, c) => swim(p, c, 'intervals'),
  'swim.open': (p, c) => swim(p, c, 'long'),
  'swim.test': () =>
    out(
      'swim',
      'test',
      'CSS-Test: 400 m und 200 m auf Zeit',
      [
        S('Aufwärmen', '300 m locker, 4 × 50 m mit steigendem Tempo, 20 s Pause'),
        S('Hauptteil', '400 m so schnell wie gleichmäßig möglich, Zeit notieren. 8 bis 10 min locker erholen. Dann 200 m so schnell wie möglich, Zeit notieren'),
        S('Auslaufen', '200 m locker ausschwimmen. Beide Zeiten im Profil unter Schwimmen eintragen'),
      ],
      40,
      true,
      { distanceKm: 1.3 },
    ),
  // ---------- Triathlon ----------
  'tri.brick': (p) => {
    const b = n(p.bikeMin, 90)
    const r = n(p.runMin, 20)
    const hard = !!p.hard
    return out(
      'bike',
      'brick',
      `Koppeleinheit: ${fmtDuration(b)} Rad, direkt danach ${r} min Laufen`,
      [
        S('Hauptteil', hard ? `Rad ${fmtDuration(b)} bei {pw:60-75}, die letzten 20 min bei {pw:80-90}` : `Rad ${fmtDuration(b)} bei {pw:60-75}`),
        S('Hauptteil', `Ohne Pause wechseln und ${r} min laufen: die ersten 5 min bewusst kurze Schritte, dann ${hard ? 'bei {pace:M}' : 'locker bei {pace:E}'}`),
        S('Hinweis', 'Laufschuhe und Getränk vorher bereitlegen. Der Wechsel ist Teil des Trainings'),
      ],
      b + r,
      hard,
    )
  },
  'any.race': (p) =>
    out(String(p.discipline ?? 'run') as Discipline, 'race', String(p.title ?? 'Wettkampf'), [S('Hauptteil', String(p.text ?? 'Gleichmäßig beginnen und das eigene Tempo halten'))], n(p.min, 120), true, {
      distanceKm: n(p.km) || undefined,
    }),
  // ---------- Kraft ----------
  'gym.session': (p) => gym(p),
  // ---------- Sonstiges ----------
  'mob.session': (p) => {
    const min = n(p.min, 20)
    return out('mobility', 'mobility', `Mobilität ${min} min`, [S('Hauptteil', `${min} min ruhige Mobilisation: Hüfte, Sprunggelenke, Brustwirbelsäule. Jede Position 60 bis 90 s, ohne Schmerz`)], min, false)
  },
  'run.test': () =>
    out(
      'run',
      'test',
      'Leistungstest: 30 min so schnell wie gleichmäßig möglich',
      [
        S('Aufwärmen', '15 min locker einlaufen, 3 Steigerungen'),
        S('Hauptteil', '30 min allein und gleichmäßig so schnell wie möglich laufen. Der Durchschnittspuls der letzten 20 min ist dein Schwellenpuls, das Durchschnittstempo etwa dein Schwellentempo'),
        S('Auslaufen', '10 min locker auslaufen. Werte im Profil eintragen'),
      ],
      55,
      true,
    ),
  'bike.test': () =>
    out(
      'bike',
      'test',
      'FTP-Test: 20 min so hart wie gleichmäßig möglich',
      [
        S('Aufwärmen', '20 min locker, darin 3 × 1 min zügig und 5 min hart, danach 5 min locker'),
        S('Hauptteil', '20 min gleichmäßig so hart wie möglich. 95 % der Durchschnittsleistung ergeben deine FTP'),
        S('Auslaufen', '10 min locker ausrollen. FTP im Profil eintragen'),
      ],
      60,
      true,
    ),
}

function bikeIv(p: P, kind: Kind, name: string, zone: string, restMin: number, prep: string): Built {
  const reps = Math.max(1, Math.round(n(p.reps, 3)))
  const rep = n(p.repMin, 15)
  const fill = Math.max(0, n(p.fillMin))
  const min = 15 + reps * rep + (reps - 1) * restMin + 10 + fill
  const steps = [
    S('Aufwärmen', '15 min einfahren bei {pw:50-70}, darin 3 × 1 min zügig'),
    S('Hauptteil', `${reps} × ${rep} min ${prep} {pw:${zone}}, dazwischen ${restMin} min locker bei {pw:45-55}`),
  ]
  if (fill) steps.push(S('Hauptteil', `Danach ${fmtDuration(fill)} Grundlage bei {pw:56-75}`))
  steps.push(S('Auslaufen', '10 min locker ausrollen'))
  return out('bike', kind, `${reps} × ${rep} min ${name}, ${restMin} min Pause`, steps, min, true)
}

function swim(p: P, c: BuildCtx, kind: Kind): Built {
  const total = Math.max(600, Math.round(n(p.m, 2000) / 100) * 100)
  const wu = total >= 1800 ? 300 : 200
  const cd = total >= 1800 ? 200 : 100
  const drill = kind === 'technique' ? Math.min(600, Math.round((total * 0.3) / 50) * 50) : total >= 1500 ? 200 : 100
  const main = Math.max(200, total - wu - cd - drill)
  let mainTxt: string
  let title: string
  if (kind === 'threshold') {
    const rep = main >= 1600 ? 200 : 100
    const reps = Math.round(main / rep)
    mainTxt = `${reps} × ${rep} m bei {css:0}, ${rep === 200 ? 20 : 15} s Pause. Jede Wiederholung gleich schnell`
    title = `${reps} × ${rep} m im Schwellentempo (CSS)`
  } else if (kind === 'intervals') {
    const reps = Math.round((main * 0.6) / 50)
    const rest = Math.round((main * 0.4) / 100) * 100
    mainTxt = `${reps} × 50 m bei {css:-5}, 30 s Pause${rest ? `. Danach ${rest} m locker bei {css:8}` : ''}`
    title = `${reps} × 50 m schnell`
  } else if (kind === 'long') {
    const blocks = main >= 1800 ? 3 : 2
    const rep = Math.round(main / blocks / 100) * 100
    mainTxt = `${blocks} × ${rep} m durchgehend bei {css:5}, 45 s Pause. Alle 6 bis 8 Züge kurz nach vorn orientieren, ohne Wende am Beckenrand abstoßen, wenn möglich`
    title = `Freiwasser-Vorbereitung ${blocks} × ${rep} m`
  } else if (kind === 'technique') {
    const reps = Math.round(main / 100)
    mainTxt = `${reps} × 100 m locker bei {css:10}, 20 s Pause. Pro Wiederholung auf einen Punkt achten: lange Züge, hoher Ellbogen, ruhiger Kopf`
    title = `Technik und Grundlage ${total} m`
  } else {
    const rep = main >= 1600 ? 400 : 200
    const reps = Math.max(2, Math.round(main / rep))
    mainTxt = `${reps} × ${rep} m bei {css:6}, 20 s Pause`
    title = `Grundlage ${reps} × ${rep} m`
  }
  const drills = Math.round(drill / 50)
  const steps = [
    S('Aufwärmen', `${wu} m locker einschwimmen, Lagen nach Wahl`),
    S('Technik', `${drills} × 50 m Technik (25 m Übung, 25 m ganze Lage), 15 s Pause: Abschlagschwimmen, Faustschwimmen, einarmig, Wasserfassen`),
    S('Hauptteil', mainTxt),
    S('Auslaufen', `${cd} m locker ausschwimmen`),
  ]
  const hard = kind === 'threshold' || kind === 'intervals'
  const min = (total / 100) * ((c.css + 12) / 60) + 6
  return out('swim', kind, title, steps, min, hard, { distanceKm: total / 1000 })
}

export interface Scheme {
  reps: string
  pct?: number
  rir: number
  rest: number
}

/** Wiederholungen, Last und Pause je Ausrichtung. week = Position im Aufbaublock (0, 1, 2 …), block = Nummer des Blocks */
export function gymScheme(focus: Focus, role: 'main' | 'acc', week: number, block: number): Scheme {
  const up = Math.min(week, 3) * 2.5 + Math.min(block, 3) * 2.5
  switch (focus) {
    case 'maxStrength':
      return role === 'main' ? { reps: '3–5', pct: Math.min(92.5, 82.5 + up), rir: 2, rest: 210 } : { reps: '6–8', pct: 75, rir: 2, rest: 120 }
    case 'strengthEndurance':
      return { reps: '15–20', pct: role === 'main' ? Math.min(60, 50 + up / 2) : undefined, rir: 3, rest: 60 }
    case 'power':
      return role === 'main' ? { reps: '3–5 explosiv', pct: Math.min(60, 40 + up), rir: 4, rest: 150 } : { reps: '5–6 explosiv', rir: 4, rest: 90 }
    case 'stability':
      return { reps: '8–12', rir: 3, rest: 45 }
    default:
      return role === 'main' ? { reps: '6–10', pct: Math.min(80, 67.5 + up), rir: 2, rest: 150 } : { reps: '10–15', rir: 2, rest: 90 }
  }
}

function gym(p: P): Built {
  const dayKey = String(p.day ?? 'fullA')
  const day = GYM_DAYS[dayKey] ?? GYM_DAYS.fullA
  const focus = String(p.focus ?? 'hypertrophy') as Focus
  const deload = !!p.deload
  const eased = !!p.eased
  const total = Math.max(6, Math.round(n(p.sets, 14) * (deload ? 0.6 : 1) * (eased ? 0.67 : 1)))
  const ids = [...day.main, ...day.acc, ...day.core]
  const base = Math.floor(total / ids.length)
  let extra = total - base * ids.length
  const sets: GymSet[] = ids.map((id, i) => {
    const role = i < day.main.length ? 'main' : 'acc'
    const ex = exerciseById(id)
    const sch = gymScheme(ex?.pattern === 'Rumpf' || ex?.pattern === 'Mobilität' ? 'stability' : focus, role, n(p.week), n(p.block))
    let s = base
    if (extra > 0) {
      s++
      extra--
    }
    s = Math.min(role === 'main' ? 5 : 4, Math.max(deload || eased ? 1 : 2, s))
    const pct = sch.pct && ex?.compound ? sch.pct - (deload ? 10 : 0) - (eased ? 10 : 0) : undefined
    return {
      exerciseId: id,
      sets: s,
      reps: ex?.timed ? '30–45 s' : sch.reps + (ex?.perSide ? ' je Seite' : ''),
      pct1rm: pct,
      rir: ex?.timed ? undefined : sch.rir + (deload || eased ? 1 : 0),
      restSec: sch.rest,
    }
  })
  const count = sets.reduce((a, s) => a + s.sets, 0)
  const min = 10 + sets.reduce((a, s) => a + (s.sets * ((s.restSec ?? 90) + 45)) / 60, 0)
  const lowerMain = day.main.some((id) => exerciseById(id)?.lower && exerciseById(id)?.compound)
  const heavyLegs = lowerMain && !deload && !eased && focus !== 'stability' && focus !== 'strengthEndurance'
  const FOCUS_NAME: Record<string, string> = { maxStrength: 'Maximalkraft', hypertrophy: 'Muskelaufbau', strengthEndurance: 'Kraftausdauer', power: 'Schnellkraft', stability: 'Stabilität' }
  const title = `${day.name}${FOCUS_NAME[focus] && !dayKey.startsWith('stab') && !dayKey.startsWith('power') ? `, ${FOCUS_NAME[focus]}` : ''}${deload ? ' (Deload)' : ''}`
  const steps = [
    S('Aufwärmen', '5 bis 10 min locker einrudern oder radeln, dann 2 Aufwärmsätze mit leichtem Gewicht für die erste Übung'),
    S('Hauptteil', `${count} Sätze insgesamt. RIR ist die Zahl der Wiederholungen, die am Satzende noch möglich wären. Wird das obere Ende des Wiederholungsbereichs in allen Sätzen erreicht, beim nächsten Mal das Gewicht leicht erhöhen`),
  ]
  if (deload) steps.push(S('Hinweis', 'Deload: weniger Sätze und etwa 10 % weniger Last. Die Sätze fühlen sich leicht an, das ist beabsichtigt'))
  return out(focus === 'stability' ? 'gym' : 'gym', focus === 'stability' ? 'mobility' : 'strength', title, steps, min, false, { gym: sets, heavyLegs })
}

export function build(spec: SessionSpec, ctx: BuildCtx): Built {
  const b = builders[spec.builder]
  if (!b) throw new Error(`Unbekannter Baustein: ${spec.builder}`)
  return b(spec.p, ctx)
}

/** Abgeschwächte Fassung derselben Einheit: weniger Wiederholungen, kürzer, eine Stufe ruhiger */
export function easeSpec(spec: SessionSpec): SessionSpec {
  const p = { ...spec.p }
  const scale = (k: string, f: number, min: number, round = 1) => {
    if (typeof p[k] === 'number') p[k] = Math.max(min, Math.round(((p[k] as number) * f) / round) * round)
  }
  if (spec.builder === 'gym.session') return { builder: spec.builder, p: { ...p, eased: true } }
  if (typeof p.reps === 'number' && (p.reps as number) > 1) scale('reps', 0.65, 2)
  else scale('repMin', 0.7, 10, 5)
  scale('km', 0.75, 3)
  scale('min', 0.75, 20, 5)
  scale('m', 0.75, 800, 100)
  scale('bikeMin', 0.75, 40, 5)
  scale('runMin', 0.7, 10, 5)
  scale('elev', 0.6, 0, 50)
  if (p.mFinishKm) p.mFinishKm = 0
  if (p.hard) p.hard = false
  if (p.down) p.down = false
  if (p.fillMin) p.fillMin = 0
  return { builder: spec.builder, p }
}

/** Lockere Ersatzeinheit in derselben Disziplin */
export function easyReplacement(discipline: Discipline, durationMin: number): SessionSpec {
  const min = Math.min(45, Math.max(20, Math.round((durationMin * 0.5) / 5) * 5))
  if (discipline === 'run') return { builder: 'run.recovery', p: { km: Math.max(3, Math.round(min / 6.5)) } }
  if (discipline === 'bike') return { builder: 'bike.recovery', p: { min } }
  if (discipline === 'swim') return { builder: 'swim.technique', p: { m: 1000 } }
  return { builder: 'mob.session', p: { min: 20 } }
}

export const hasBuilder = (name: string) => name in builders
