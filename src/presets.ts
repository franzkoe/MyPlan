// Fertige Bausteine zum Hinzufügen oder Ersetzen einer Einheit
import type { Discipline, SessionSpec } from './logic/types'

export const PRESETS: Record<Discipline, { label: string; spec: SessionSpec }[]> = {
  run: [
    { label: 'Lockerer Dauerlauf 8 km', spec: { builder: 'run.easy', p: { km: 8 } } },
    { label: 'Regenerationslauf 5 km', spec: { builder: 'run.recovery', p: { km: 5 } } },
    { label: 'Langer Lauf 16 km', spec: { builder: 'run.long', p: { km: 16 } } },
    { label: 'Tempodauerlauf 20 min an der Schwelle', spec: { builder: 'run.threshold', p: { reps: 1, repMin: 20 } } },
    { label: '4 × 6 min an der Schwelle', spec: { builder: 'run.threshold', p: { reps: 4, repMin: 6 } } },
    { label: '5 × 800 m im Intervalltempo', spec: { builder: 'run.intervals', p: { reps: 5, dist: 800 } } },
    { label: '8 × 60 s Bergläufe', spec: { builder: 'run.hills', p: { reps: 8, repSec: 60 } } },
    { label: 'Leistungstest 30 min', spec: { builder: 'run.test', p: {} } },
  ],
  bike: [
    { label: 'Grundlagenfahrt 1:30 h', spec: { builder: 'bike.easy', p: { min: 90 } } },
    { label: 'Lockeres Ausrollen 45 min', spec: { builder: 'bike.recovery', p: { min: 45 } } },
    { label: 'Lange Ausfahrt 3 h', spec: { builder: 'bike.long', p: { min: 180 } } },
    { label: '3 × 15 min Sweet Spot', spec: { builder: 'bike.sweetspot', p: { reps: 3, repMin: 15 } } },
    { label: '2 × 20 min an der Schwelle', spec: { builder: 'bike.threshold', p: { reps: 2, repMin: 20 } } },
    { label: '5 × 4 min VO2max', spec: { builder: 'bike.vo2', p: { reps: 5, repMin: 4 } } },
    { label: 'FTP-Test 20 min', spec: { builder: 'bike.test', p: {} } },
  ],
  swim: [
    { label: 'Technik und Grundlage 1500 m', spec: { builder: 'swim.technique', p: { m: 1500 } } },
    { label: 'Grundlage 2000 m', spec: { builder: 'swim.endurance', p: { m: 2000 } } },
    { label: 'Schwellensatz (CSS) 2000 m', spec: { builder: 'swim.threshold', p: { m: 2000 } } },
    { label: 'Schnelle 50er, 1500 m', spec: { builder: 'swim.speed', p: { m: 1500 } } },
    { label: 'Freiwasser-Vorbereitung 2500 m', spec: { builder: 'swim.open', p: { m: 2500 } } },
    { label: 'CSS-Test', spec: { builder: 'swim.test', p: {} } },
  ],
  gym: [
    { label: 'Ganzkörper A, Muskelaufbau', spec: { builder: 'gym.session', p: { day: 'fullA', focus: 'hypertrophy', sets: 14 } } },
    { label: 'Ganzkörper B, Muskelaufbau', spec: { builder: 'gym.session', p: { day: 'fullB', focus: 'hypertrophy', sets: 14 } } },
    { label: 'Kraft für Ausdauer A', spec: { builder: 'gym.session', p: { day: 'enduranceA', focus: 'maxStrength', sets: 12 } } },
    { label: 'Kraft für Ausdauer B', spec: { builder: 'gym.session', p: { day: 'enduranceB', focus: 'maxStrength', sets: 12 } } },
    { label: 'Oberkörper A', spec: { builder: 'gym.session', p: { day: 'upperA', focus: 'hypertrophy', sets: 16 } } },
    { label: 'Unterkörper A', spec: { builder: 'gym.session', p: { day: 'lowerA', focus: 'hypertrophy', sets: 14 } } },
    { label: 'Stabilität und Mobilität', spec: { builder: 'gym.session', p: { day: 'stabA', focus: 'stability', sets: 12 } } },
  ],
  mobility: [{ label: 'Mobilität 20 min', spec: { builder: 'mob.session', p: { min: 20 } } }],
}
