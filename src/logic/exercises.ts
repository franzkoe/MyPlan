// Übungsbibliothek für das Krafttraining
export interface Exercise {
  id: string
  name: string
  muscles: string[]
  pattern: 'Kniebeuge' | 'Hüftstreckung' | 'Drücken' | 'Ziehen' | 'Rumpf' | 'Sprung' | 'Einbeinig' | 'Isolation' | 'Mobilität'
  alt: string[]
  lower: boolean
  compound: boolean
  /** Grundübung mit 1RM im Profil */
  base?: boolean
  perSide?: boolean
  timed?: boolean
}

export const MUSCLES = ['Beine vorn', 'Beine hinten', 'Gesäß', 'Waden', 'Brust', 'Rücken', 'Schultern', 'Arme', 'Rumpf']

const e = (
  id: string,
  name: string,
  muscles: string[],
  pattern: Exercise['pattern'],
  alt: string[],
  flags: Partial<Exercise> = {},
): Exercise => ({ id, name, muscles, pattern, alt, lower: false, compound: false, ...flags })

export const EXERCISES: Exercise[] = [
  e('squat', 'Kniebeuge', ['Beine vorn', 'Gesäß'], 'Kniebeuge', ['frontSquat', 'legPress', 'gobletSquat'], { lower: true, compound: true, base: true }),
  e('frontSquat', 'Frontkniebeuge', ['Beine vorn', 'Gesäß', 'Rumpf'], 'Kniebeuge', ['squat', 'gobletSquat'], { lower: true, compound: true }),
  e('gobletSquat', 'Goblet-Kniebeuge', ['Beine vorn', 'Gesäß'], 'Kniebeuge', ['squat', 'legPress'], { lower: true, compound: true }),
  e('legPress', 'Beinpresse', ['Beine vorn', 'Gesäß'], 'Kniebeuge', ['squat', 'gobletSquat'], { lower: true, compound: true }),
  e('deadlift', 'Kreuzheben', ['Beine hinten', 'Gesäß', 'Rücken'], 'Hüftstreckung', ['rdl', 'trapBar'], { lower: true, compound: true, base: true }),
  e('trapBar', 'Kreuzheben mit Trap-Bar', ['Beine vorn', 'Beine hinten', 'Gesäß'], 'Hüftstreckung', ['deadlift'], { lower: true, compound: true }),
  e('rdl', 'Rumänisches Kreuzheben', ['Beine hinten', 'Gesäß'], 'Hüftstreckung', ['deadlift', 'legCurl', 'singleLegRdl'], { lower: true, compound: true }),
  e('hipThrust', 'Hip Thrust', ['Gesäß', 'Beine hinten'], 'Hüftstreckung', ['rdl', 'gluteBridge'], { lower: true, compound: true }),
  e('gluteBridge', 'Beckenheben', ['Gesäß'], 'Hüftstreckung', ['hipThrust'], { lower: true }),
  e('lunge', 'Ausfallschritt', ['Beine vorn', 'Gesäß'], 'Einbeinig', ['splitSquat', 'stepUp'], { lower: true, compound: true, perSide: true }),
  e('splitSquat', 'Bulgarische Kniebeuge', ['Beine vorn', 'Gesäß'], 'Einbeinig', ['lunge', 'stepUp'], { lower: true, compound: true, perSide: true }),
  e('stepUp', 'Aufsteiger auf Kasten', ['Beine vorn', 'Gesäß'], 'Einbeinig', ['lunge', 'splitSquat'], { lower: true, compound: true, perSide: true }),
  e('singleLegRdl', 'Einbeiniges Kreuzheben', ['Beine hinten', 'Gesäß', 'Rumpf'], 'Einbeinig', ['rdl'], { lower: true, perSide: true }),
  e('legCurl', 'Beinbeuger', ['Beine hinten'], 'Isolation', ['rdl', 'nordic'], { lower: true }),
  e('nordic', 'Nordic Hamstring Curl', ['Beine hinten'], 'Isolation', ['legCurl'], { lower: true }),
  e('calfRaise', 'Wadenheben', ['Waden'], 'Isolation', ['calfRaiseSingle'], { lower: true }),
  e('calfRaiseSingle', 'Einbeiniges Wadenheben', ['Waden'], 'Isolation', ['calfRaise'], { lower: true, perSide: true }),
  e('bench', 'Bankdrücken', ['Brust', 'Schultern', 'Arme'], 'Drücken', ['inclineDb', 'pushup', 'dips'], { compound: true, base: true }),
  e('inclineDb', 'Schrägbankdrücken mit Kurzhanteln', ['Brust', 'Schultern'], 'Drücken', ['bench', 'pushup'], { compound: true }),
  e('pushup', 'Liegestütz', ['Brust', 'Schultern', 'Arme'], 'Drücken', ['bench', 'dips'], { compound: true }),
  e('dips', 'Dips', ['Brust', 'Arme'], 'Drücken', ['pushup', 'triceps'], { compound: true }),
  e('ohp', 'Überkopfdrücken', ['Schultern', 'Arme'], 'Drücken', ['dbPress', 'lateralRaise'], { compound: true, base: true }),
  e('dbPress', 'Schulterdrücken mit Kurzhanteln', ['Schultern', 'Arme'], 'Drücken', ['ohp'], { compound: true }),
  e('lateralRaise', 'Seitheben', ['Schultern'], 'Isolation', ['dbPress']),
  e('row', 'Langhantelrudern', ['Rücken', 'Arme'], 'Ziehen', ['dbRow', 'cableRow'], { compound: true, base: true }),
  e('dbRow', 'Einarmiges Kurzhantelrudern', ['Rücken', 'Arme'], 'Ziehen', ['row', 'cableRow'], { compound: true, perSide: true }),
  e('cableRow', 'Rudern am Kabelzug', ['Rücken', 'Arme'], 'Ziehen', ['row', 'dbRow'], { compound: true }),
  e('pullup', 'Klimmzug', ['Rücken', 'Arme'], 'Ziehen', ['latPull', 'cableRow'], { compound: true, base: true }),
  e('latPull', 'Latzug', ['Rücken', 'Arme'], 'Ziehen', ['pullup'], { compound: true }),
  e('facePull', 'Face Pull', ['Schultern', 'Rücken'], 'Isolation', ['dbRow']),
  e('curl', 'Bizepscurl', ['Arme'], 'Isolation', ['pullup']),
  e('triceps', 'Trizepsdrücken am Kabel', ['Arme'], 'Isolation', ['dips']),
  e('plank', 'Unterarmstütz', ['Rumpf'], 'Rumpf', ['deadBug', 'pallof'], { timed: true }),
  e('sidePlank', 'Seitstütz', ['Rumpf'], 'Rumpf', ['pallof', 'copenhagen'], { timed: true, perSide: true }),
  e('pallof', 'Pallof Press', ['Rumpf'], 'Rumpf', ['sidePlank', 'plank'], { perSide: true }),
  e('deadBug', 'Dead Bug', ['Rumpf'], 'Rumpf', ['plank', 'birdDog'], { perSide: true }),
  e('birdDog', 'Vierfüßlerstand diagonal', ['Rumpf', 'Gesäß'], 'Rumpf', ['deadBug'], { perSide: true }),
  e('copenhagen', 'Copenhagen Plank', ['Rumpf', 'Beine hinten'], 'Rumpf', ['sidePlank'], { timed: true, perSide: true, lower: true }),
  e('boxJump', 'Kastensprung', ['Beine vorn', 'Gesäß', 'Waden'], 'Sprung', ['squatJump'], { lower: true }),
  e('squatJump', 'Strecksprung', ['Beine vorn', 'Gesäß', 'Waden'], 'Sprung', ['boxJump'], { lower: true }),
  e('kbSwing', 'Kettlebell-Schwung', ['Gesäß', 'Beine hinten'], 'Hüftstreckung', ['hipThrust'], { lower: true }),
  e('medBall', 'Medizinball-Wurf', ['Rumpf', 'Schultern'], 'Sprung', ['pushup']),
  e('hipMob', 'Hüftmobilisation (90/90)', ['Gesäß'], 'Mobilität', ['worldsGreatest'], { perSide: true, timed: true }),
  e('worldsGreatest', 'Ausfallschritt mit Rotation', ['Beine vorn', 'Rumpf'], 'Mobilität', ['hipMob'], { perSide: true }),
  e('ankleMob', 'Sprunggelenk-Mobilisation', ['Waden'], 'Mobilität', ['calfRaise'], { perSide: true }),
  e('tSpine', 'Brustwirbelsäulen-Rotation', ['Rücken'], 'Mobilität', ['worldsGreatest'], { perSide: true }),
]

export const BASE_LIFTS = EXERCISES.filter((x) => x.base).map((x) => x.id)

export function exerciseById(id: string, custom: { id: string; name: string; muscles: string[]; pattern: string }[] = []): Exercise | undefined {
  const hit = EXERCISES.find((x) => x.id === id)
  if (hit) return hit
  const c = custom.find((x) => x.id === id)
  return c ? { id: c.id, name: c.name, muscles: c.muscles, pattern: 'Isolation', alt: [], lower: false, compound: false } : undefined
}

export const exerciseName = (id: string, custom: { id: string; name: string; muscles: string[]; pattern: string }[] = []) => exerciseById(id, custom)?.name ?? id

/** Trainingstage je Aufteilung */
export const GYM_DAYS: Record<string, { name: string; main: string[]; acc: string[]; core: string[] }> = {
  fullA: { name: 'Ganzkörper A', main: ['squat', 'bench', 'row'], acc: ['rdl'], core: ['plank'] },
  fullB: { name: 'Ganzkörper B', main: ['deadlift', 'ohp', 'pullup'], acc: ['lunge'], core: ['sidePlank'] },
  fullC: { name: 'Ganzkörper C', main: ['frontSquat', 'inclineDb', 'latPull'], acc: ['hipThrust'], core: ['pallof'] },
  upperA: { name: 'Oberkörper A', main: ['bench', 'row'], acc: ['ohp', 'latPull', 'curl', 'triceps'], core: [] },
  upperB: { name: 'Oberkörper B', main: ['ohp', 'pullup'], acc: ['inclineDb', 'cableRow', 'lateralRaise', 'facePull'], core: [] },
  lowerA: { name: 'Unterkörper A', main: ['squat', 'rdl'], acc: ['lunge', 'calfRaise'], core: ['plank'] },
  lowerB: { name: 'Unterkörper B', main: ['deadlift', 'legPress'], acc: ['hipThrust', 'legCurl'], core: ['sidePlank'] },
  push: { name: 'Push (Drücken)', main: ['bench', 'ohp'], acc: ['inclineDb', 'lateralRaise', 'triceps'], core: [] },
  pull: { name: 'Pull (Ziehen)', main: ['pullup', 'row'], acc: ['latPull', 'facePull', 'curl'], core: [] },
  legs: { name: 'Beine', main: ['squat', 'rdl'], acc: ['legPress', 'legCurl', 'calfRaise'], core: ['plank'] },
  enduranceA: { name: 'Kraft für Ausdauer A', main: ['squat', 'singleLegRdl'], acc: ['stepUp', 'calfRaise'], core: ['plank', 'sidePlank'] },
  enduranceB: { name: 'Kraft für Ausdauer B', main: ['deadlift', 'splitSquat'], acc: ['hipThrust', 'row'], core: ['copenhagen', 'pallof'] },
  powerA: { name: 'Schnellkraft A', main: ['boxJump', 'squat'], acc: ['kbSwing', 'medBall'], core: ['plank'] },
  powerB: { name: 'Schnellkraft B', main: ['squatJump', 'trapBar'], acc: ['medBall', 'pushup'], core: ['pallof'] },
  stabA: { name: 'Stabilität und Mobilität A', main: ['sidePlank', 'deadBug', 'singleLegRdl'], acc: ['hipMob', 'ankleMob'], core: ['birdDog'] },
  stabB: { name: 'Stabilität und Mobilität B', main: ['plank', 'pallof', 'copenhagen'], acc: ['worldsGreatest', 'tSpine'], core: ['gluteBridge'] },
}

export function gymRotation(split: string, focus: string, goal: string, n: number): string[] {
  if (focus === 'stability') return ['stabA', 'stabB']
  if (focus === 'power') return ['powerA', 'powerB']
  if (goal === 'endurance') return ['enduranceA', 'enduranceB']
  if (split === 'upperLower') return ['upperA', 'lowerA', 'upperB', 'lowerB']
  if (split === 'ppl') return ['push', 'pull', 'legs']
  return n <= 2 ? ['fullA', 'fullB'] : ['fullA', 'fullB', 'fullC']
}
