// Lokale Speicherung in IndexedDB. Nichts verlässt das Gerät.
import Dexie, { type Table } from 'dexie'
import { DATA_VERSION, emptyData, emptyProfile, type AppData } from './logic/types'

class Db extends Dexie {
  kv!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('myplan')
    this.version(1).stores({ kv: 'key' })
  }
}
const db = new Db()

/** Ergänzt fehlende Felder, damit ältere Sicherungen lesbar bleiben */
export function normalize(raw: unknown): AppData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<AppData>
  return {
    ...base,
    ...r,
    version: DATA_VERSION,
    profile: { ...emptyProfile(), ...(r.profile ?? {}), units: { ...emptyProfile().units, ...(r.profile?.units ?? {}) }, reminder: { ...emptyProfile().reminder, ...(r.profile?.reminder ?? {}) } },
    goals: Array.isArray(r.goals) ? r.goals : [],
    plans: Array.isArray(r.plans) ? r.plans : [],
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    activities: Array.isArray(r.activities) ? r.activities : [],
    recovery: Array.isArray(r.recovery) ? r.recovery : [],
    readiness: Array.isArray(r.readiness) ? r.readiness : [],
    customExercises: Array.isArray(r.customExercises) ? r.customExercises : [],
    customTemplates: Array.isArray(r.customTemplates) ? r.customTemplates : [],
    dismissed: Array.isArray(r.dismissed) ? r.dismissed : [],
  }
}

export async function loadData(): Promise<AppData> {
  try {
    const row = await db.kv.get('data')
    return normalize(row?.value)
  } catch {
    return emptyData()
  }
}

export async function saveData(data: AppData): Promise<void> {
  await db.kv.put({ key: 'data', value: data })
}

export function parseBackup(text: string): AppData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung (kein JSON)')
  }
  const r = raw as { app?: string; data?: unknown }
  if (!r || r.app !== 'MyPlan' || !r.data) throw new Error('Die Datei stammt nicht aus dieser App')
  return normalize(r.data)
}

export function makeBackup(data: AppData): string {
  return JSON.stringify({ app: 'MyPlan', exportedAt: new Date().toISOString(), version: DATA_VERSION, data })
}
