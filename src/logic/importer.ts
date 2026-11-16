// Dateiimport: GPX, TCX, FIT und CSV (Whoop, Garmin). Fehlerhafte Dateien führen zu einer
// verständlichen Meldung, nie zu einem Absturz.
import { Decoder, Stream } from '@garmin/fitsdk'
import { XMLParser } from 'fast-xml-parser'
import { diffDays, iso, parseTime } from './dates'
import { normalizedPower, tssHr, tssPace, tssPower, tssRpe } from './load'
import { latest, type Activity, type BestEffort, type Discipline, type Profile, type Session } from './types'
import { effectiveHrMax, hrZones, powerZones, runFitness, pacesFromVdot, zoneOf } from './zones'

export interface RawPoint {
  /** Sekunden seit Start */
  t: number
  hr?: number
  pw?: number
  cad?: number
  ele?: number
  /** Meter seit Start */
  dist?: number
  lat?: number
  lon?: number
}

export interface RawActivity {
  format: Activity['source']
  fileName: string
  sportLabel?: string
  discipline: Discipline
  /** Erkennung der Sportart war unsicher */
  guessed?: boolean
  /** Datei war unvollständig, nur der lesbare Teil wurde übernommen */
  truncated?: boolean
  start: string
  points: RawPoint[]
  summary: { durationSec?: number; distanceM?: number; avgHr?: number; maxHr?: number; avgPower?: number; elevationM?: number; strain?: number }
}

export interface RecoveryDay {
  date: string
  hrv?: number
  rhr?: number
  sleepH?: number
}

export interface ParsedFile {
  fileName: string
  activities: RawActivity[]
  recoveryDays: RecoveryDay[]
  error?: string
  note?: string
}

export function detectDiscipline(label: string | undefined): { discipline: Discipline; guessed: boolean } {
  const s = (label ?? '').toLowerCase()
  if (/swim|schwimm|pool|open.?water/.test(s)) return { discipline: 'swim', guessed: false }
  if (/bik|cycl|rad|ride|spinning|gravel|mtb|virtual_ride/.test(s)) return { discipline: 'bike', guessed: false }
  if (/run|lauf|trail|jog|treadmill|walk|hik|wander/.test(s)) return { discipline: 'run', guessed: false }
  if (/strength|kraft|weight|gym|functional|training|crossfit|hiit/.test(s)) return { discipline: 'gym', guessed: false }
  if (/yoga|mobil|stretch|pilates/.test(s)) return { discipline: 'mobility', guessed: false }
  return { discipline: 'run', guessed: true }
}

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const x = typeof v === 'number' ? v : Number(String(v).trim())
  return isFinite(x) ? x : undefined
}
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false })

function deep(obj: unknown, name: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.toLowerCase() === name) return typeof v === 'object' && v !== null && '#text' in (v as object) ? (v as Record<string, unknown>)['#text'] : v
    const d = deep(v, name)
    if (d !== undefined) return d
  }
  return undefined
}

export function parseGpx(text: string, fileName: string): RawActivity[] {
  const doc = xml.parse(text)
  if (!doc.gpx) throw new Error('Die Datei enthält keine GPX-Daten')
  const out: RawActivity[] = []
  for (const trk of arr<any>(doc.gpx.trk)) {
    const pts: RawPoint[] = []
    let t0: number | undefined
    for (const seg of arr<any>(trk.trkseg)) {
      for (const p of arr<any>(seg.trkpt)) {
        const time = p.time ? Date.parse(p.time) : NaN
        if (!isFinite(time)) continue
        if (t0 === undefined) t0 = time
        pts.push({
          t: (time - t0) / 1000,
          lat: num(p['@_lat']),
          lon: num(p['@_lon']),
          ele: num(p.ele),
          hr: num(deep(p.extensions, 'hr')),
          cad: num(deep(p.extensions, 'cad')),
          pw: num(deep(p.extensions, 'power')) ?? num(deep(p.extensions, 'watts')),
        })
      }
    }
    if (t0 === undefined || pts.length < 2) continue
    const label = String(trk.type ?? trk.name ?? '')
    out.push({ format: 'gpx', fileName, sportLabel: label, ...detectDiscipline(`${trk.type ?? ''} ${trk.name ?? ''}`), start: new Date(t0).toISOString(), points: pts, summary: {} })
  }
  if (!out.length) throw new Error('In der GPX-Datei steht keine Aufzeichnung mit Zeitstempeln. Reine Routen ohne Zeiten lassen sich nicht als Einheit einlesen')
  return out
}

export function parseTcx(text: string, fileName: string): RawActivity[] {
  const doc = xml.parse(text)
  const acts = arr<any>(doc.TrainingCenterDatabase?.Activities?.Activity)
  if (!doc.TrainingCenterDatabase) throw new Error('Die Datei enthält keine TCX-Daten')
  const out: RawActivity[] = []
  for (const a of acts) {
    const pts: RawPoint[] = []
    let t0: number | undefined
    let dur = 0
    let dist = 0
    for (const lap of arr<any>(a.Lap)) {
      dur += num(lap.TotalTimeSeconds) ?? 0
      dist += num(lap.DistanceMeters) ?? 0
      for (const trk of arr<any>(lap.Track)) {
        for (const p of arr<any>(trk.Trackpoint)) {
          const time = p.Time ? Date.parse(p.Time) : NaN
          if (!isFinite(time)) continue
          if (t0 === undefined) t0 = time
          pts.push({
            t: (time - t0) / 1000,
            lat: num(p.Position?.LatitudeDegrees),
            lon: num(p.Position?.LongitudeDegrees),
            ele: num(p.AltitudeMeters),
            dist: num(p.DistanceMeters),
            hr: num(p.HeartRateBpm?.Value),
            cad: num(p.Cadence) ?? num(deep(p.Extensions, 'runcadence')),
            pw: num(deep(p.Extensions, 'watts')),
          })
        }
      }
    }
    const startTxt = a.Id ?? arr<any>(a.Lap)[0]?.['@_StartTime']
    const start = t0 ?? (startTxt ? Date.parse(startTxt) : NaN)
    if (!isFinite(start)) continue
    out.push({
      format: 'tcx',
      fileName,
      sportLabel: a['@_Sport'],
      ...detectDiscipline(a['@_Sport']),
      start: new Date(start).toISOString(),
      points: pts,
      summary: { durationSec: dur || undefined, distanceM: dist || undefined },
    })
  }
  if (!out.length) throw new Error('In der TCX-Datei steht keine Aktivität')
  return out
}

export function parseFit(bytes: Uint8Array, fileName: string): RawActivity[] {
  const stream = Stream.fromByteArray(Array.from(bytes))
  const decoder = new Decoder(stream)
  if (!decoder.isFIT()) throw new Error('Die Datei ist keine gültige FIT-Datei')
  const { messages, errors } = decoder.read()
  const m = messages as Record<string, any[]>
  const records = m.recordMesgs ?? []
  const session = (m.sessionMesgs ?? [])[0]
  if (!records.length && !session) {
    throw new Error(errors?.length ? 'Die FIT-Datei ist beschädigt oder unvollständig' : 'Die FIT-Datei enthält keine Trainingsaufzeichnung. Vielleicht ist es eine Einstellungs- oder Kursdatei')
  }
  const broken = !!errors?.length
  if (broken && !session && records.length < 60) throw new Error('Die FIT-Datei ist beschädigt oder unvollständig. Es ließ sich keine verwertbare Aufzeichnung lesen')
  const toMs = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d * 1000 + 631065600000 : NaN)
  const startMs = records.length ? toMs(records[0].timestamp) : toMs(session.startTime)
  if (!isFinite(startMs)) throw new Error('In der FIT-Datei fehlt die Startzeit')
  const pts: RawPoint[] = []
  for (const r of records) {
    const t = toMs(r.timestamp)
    if (!isFinite(t)) continue
    pts.push({
      t: (t - startMs) / 1000,
      hr: num(r.heartRate),
      pw: num(r.power),
      cad: num(r.cadence),
      ele: num(r.enhancedAltitude) ?? num(r.altitude),
      dist: num(r.distance),
      lat: typeof r.positionLat === 'number' ? (r.positionLat * 180) / 2 ** 31 : undefined,
      lon: typeof r.positionLong === 'number' ? (r.positionLong * 180) / 2 ** 31 : undefined,
    })
  }
  const label = `${session?.sport ?? m.sportMesgs?.[0]?.sport ?? ''} ${session?.subSport ?? ''}`
  return [
    {
      format: 'fit',
      fileName,
      truncated: broken || undefined,
      sportLabel: label.trim(),
      ...detectDiscipline(label),
      start: new Date(startMs).toISOString(),
      points: pts,
      summary: {
        durationSec: num(session?.totalTimerTime) ?? num(session?.totalElapsedTime),
        distanceM: num(session?.totalDistance),
        avgHr: num(session?.avgHeartRate),
        maxHr: num(session?.maxHeartRate),
        avgPower: num(session?.avgPower),
        elevationM: num(session?.totalAscent),
      },
    },
  ]
}

// ---------- CSV ----------

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/)[0] ?? ''
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (q) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

/** Zahl in deutscher oder englischer Schreibweise */
export function parseNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined
  let t = s.trim().replace(/[^\d,.\-]/g, '')
  if (!t || t === '-' || t === '--') return undefined
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = /^\-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  const x = Number(t)
  return isFinite(x) ? x : undefined
}

export function parseDateTime(s: string | undefined): Date | undefined {
  if (!s) return undefined
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0))
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0))
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0))
  const d = new Date(t)
  return isFinite(d.getTime()) ? d : undefined
}

export function parseCsv(text: string, fileName: string): ParsedFile {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('Die CSV-Datei ist leer oder enthält nur eine Kopfzeile')
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...pats: RegExp[]) => {
    for (const p of pats) {
      const i = head.findIndex((h) => p.test(h))
      if (i >= 0) return i
    }
    return -1
  }
  const body = rows.slice(1)
  const res: ParsedFile = { fileName, activities: [], recoveryDays: [] }

  // Whoop: Trainings
  const wStart = col(/^workout start time/)
  if (wStart >= 0) {
    const cName = col(/^activity name/)
    const cDur = col(/^duration \(min\)/)
    const cEnd = col(/^workout end time/)
    const cAvg = col(/^average hr/)
    const cMax = col(/^max hr/)
    const cDist = col(/^distance \(meters\)/)
    const cStrain = col(/^activity strain/)
    const cAlt = col(/^altitude gain/)
    for (const r of body) {
      const start = parseDateTime(r[wStart])
      if (!start) continue
      const end = parseDateTime(r[cEnd])
      const dur = (parseNumber(r[cDur]) ?? 0) * 60 || (end ? (end.getTime() - start.getTime()) / 1000 : 0)
      if (dur <= 0) continue
      res.activities.push({
        format: 'csv',
        fileName,
        sportLabel: r[cName],
        ...detectDiscipline(r[cName]),
        start: start.toISOString(),
        points: [],
        summary: { durationSec: dur, avgHr: parseNumber(r[cAvg]), maxHr: parseNumber(r[cMax]), distanceM: parseNumber(r[cDist]) || undefined, strain: parseNumber(r[cStrain]), elevationM: parseNumber(r[cAlt]) || undefined },
      })
    }
    if (!res.activities.length) throw new Error('In der Whoop-Datei steht keine lesbare Einheit')
    return res
  }

  // Garmin: Aktivitätenliste
  const gType = col(/^activity type$/, /^aktivitätstyp$/)
  const gDate = col(/^date$/, /^datum$/)
  if (gType >= 0 && gDate >= 0) {
    const cDist = col(/^distance$/, /^distanz$/)
    const cTime = col(/^time$/, /^zeit$/)
    const cAvg = col(/^avg hr$/, /^ø herzfrequenz$/, /^ø hf$/, /herzfrequenz/)
    const cMax = col(/^max hr$/, /^maximale herzfrequenz$/, /^max\. hf$/)
    const cAsc = col(/^total ascent$/, /^anstieg gesamt$/, /^gesamtanstieg$/)
    const cPow = col(/^avg power$/, /^ø leistung$/)
    const cTitle = col(/^title$/, /^titel$/)
    for (const r of body) {
      const start = parseDateTime(r[gDate])
      const dur = parseTime(r[cTime] ?? '')
      if (!start || !dur) continue
      const d = detectDiscipline(`${r[gType]} ${r[cTitle] ?? ''}`)
      let dist = parseNumber(r[cDist])
      if (dist !== undefined) dist = d.discipline === 'swim' && dist > 50 ? dist : dist * 1000
      res.activities.push({
        format: 'csv',
        fileName,
        sportLabel: r[gType],
        ...d,
        start: start.toISOString(),
        points: [],
        summary: { durationSec: dur, distanceM: dist || undefined, avgHr: parseNumber(r[cAvg]), maxHr: parseNumber(r[cMax]), elevationM: parseNumber(r[cAsc]), avgPower: parseNumber(r[cPow]) },
      })
    }
    if (!res.activities.length) throw new Error('In der Garmin-Datei steht keine lesbare Einheit')
    return res
  }

  // Erholungsdaten: Whoop physiological_cycles, Garmin-HRV-Export oder eigene Tabelle
  const cHrv = col(/heart rate variability/, /hrv/, /rmssd/, /herzfrequenzvariab/)
  const cRhr = col(/resting heart rate/, /ruhepuls/, /ruhe-?herzfrequenz/, /^rhr/, /resting hr/)
  const cSleep = col(/asleep duration/, /schlafdauer/, /sleep duration/, /^schlaf/, /^sleep/)
  const cDate = col(/^cycle start time/, /^date$/, /^datum$/, /^day$/, /^tag$/, /date/, /datum/, /sleep onset/)
  if (cDate >= 0 && (cHrv >= 0 || cRhr >= 0 || cSleep >= 0)) {
    const sleepInMin = cSleep >= 0 && /min/.test(head[cSleep])
    for (const r of body) {
      const d = parseDateTime(r[cDate])
      if (!d) continue
      let sleep = cSleep >= 0 ? (/:/.test(r[cSleep] ?? '') ? (parseTime(r[cSleep]) ?? 0) / 60 : parseNumber(r[cSleep])) : undefined
      if (sleep !== undefined && (sleepInMin || sleep > 24)) sleep = sleep / 60
      const day: RecoveryDay = { date: iso(d), hrv: cHrv >= 0 ? parseNumber(r[cHrv]) : undefined, rhr: cRhr >= 0 ? parseNumber(r[cRhr]) : undefined, sleepH: sleep ? Math.round(sleep * 10) / 10 : undefined }
      if (day.hrv !== undefined && (day.hrv < 5 || day.hrv > 300)) day.hrv = undefined
      if (day.rhr !== undefined && (day.rhr < 25 || day.rhr > 120)) day.rhr = undefined
      if (day.hrv !== undefined || day.rhr !== undefined || day.sleepH !== undefined) res.recoveryDays.push(day)
    }
    if (!res.recoveryDays.length) throw new Error('In der Datei stehen keine lesbaren Erholungswerte')
    return res
  }
  throw new Error('Die Spalten dieser CSV-Datei erkennt die App nicht. Unterstützt werden die Whoop-Exporte „workouts“ und „physiological_cycles“, die Garmin-Aktivitätenliste und Tabellen mit Datum, HRV und Ruhepuls')
}

/** Liest eine Datei ein. Wirft nie: Fehler stehen als Meldung im Ergebnis. */
export function parseFile(fileName: string, bytes: Uint8Array): ParsedFile {
  const empty: ParsedFile = { fileName, activities: [], recoveryDays: [] }
  try {
    if (bytes.length === 0) return { ...empty, error: 'Die Datei ist leer' }
    const ext = fileName.toLowerCase().split('.').pop() ?? ''
    const isFitMagic = bytes.length > 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54
    if (ext === 'fit' || isFitMagic) {
      const activities = parseFit(bytes, fileName)
      return { ...empty, activities, note: activities.some((a) => a.truncated) ? 'Die Datei ist unvollständig. Eingelesen wurde der lesbare Teil' : undefined }
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    if (ext === 'gpx' || /<gpx[\s>]/i.test(text.slice(0, 2000))) return { ...empty, activities: parseGpx(text, fileName) }
    if (ext === 'tcx' || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) return { ...empty, activities: parseTcx(text, fileName) }
    if (ext === 'csv' || ext === 'txt') return parseCsv(text, fileName)
    if (ext === 'zip') return { ...empty, error: 'ZIP-Archive bitte zuerst entpacken und die enthaltenen Dateien auswählen' }
    return { ...empty, error: `Das Format „.${ext}“ wird nicht unterstützt. Möglich sind GPX, TCX, FIT und CSV` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    const known = /Datei|Whoop|Garmin|Spalten|GPX|TCX|FIT|CSV/.test(msg)
    return { ...empty, error: known ? msg : 'Die Datei ist beschädigt oder unvollständig und lässt sich nicht lesen' }
  }
}

// ---------- Auswertung einer Aufzeichnung ----------

function haversine(a: RawPoint, b: RawPoint): number {
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return 0
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Höhenmeter im Anstieg: geglättet, Schwankungen unter 2 m werden ignoriert */
export function elevationGain(ele: number[]): number {
  if (ele.length < 2) return 0
  const sm = ele.map((_, i) => {
    const a = Math.max(0, i - 2)
    const b = Math.min(ele.length, i + 3)
    let s = 0
    for (let k = a; k < b; k++) s += ele[k]
    return s / (b - a)
  })
  let gain = 0
  let ref = sm[0]
  for (const e of sm) {
    if (e - ref >= 2) {
      gain += e - ref
      ref = e
    } else if (ref - e >= 2) ref = e
  }
  return Math.round(gain)
}

/** Schnellste Zeit über eine Distanz innerhalb einer Aufzeichnung */
export function bestTimeForDistance(pts: { t: number; dist: number }[], meters: number): number | undefined {
  let best: number | undefined
  let j = 0
  for (let i = 0; i < pts.length; i++) {
    while (j < pts.length && pts[j].dist - pts[i].dist < meters) j++
    if (j >= pts.length) break
    const a = pts[j - 1]
    const b = pts[j]
    const need = pts[i].dist + meters
    const frac = b.dist > a.dist ? (need - a.dist) / (b.dist - a.dist) : 1
    const t = a.t + (b.t - a.t) * Math.min(1, Math.max(0, frac)) - pts[i].t
    if (t > 0 && (best === undefined || t < best)) best = t
  }
  return best
}

/** Beste Durchschnittsleistung über ein Zeitfenster (Werte im 1-s-Raster) */
export function bestAverage(values: number[], windowSec: number): number | undefined {
  if (values.length < windowSec) return undefined
  let sum = 0
  for (let i = 0; i < windowSec; i++) sum += values[i]
  let best = sum
  for (let i = windowSec; i < values.length; i++) {
    sum += values[i] - values[i - windowSec]
    if (sum > best) best = sum
  }
  return best / windowSec
}

function perSecond(pts: RawPoint[], pick: (p: RawPoint) => number | undefined): number[] {
  const out: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const v = pick(pts[i])
    const dt = Math.round(pts[i + 1].t - pts[i].t)
    if (v === undefined || dt <= 0) continue
    const n = dt > 10 ? 1 : dt
    for (let k = 0; k < n; k++) out.push(v)
  }
  return out
}

export const RUN_BEST_DISTANCES = [1000, 5000, 10000, 21097.5, 42195]
export const POWER_BEST_WINDOWS = [300, 1200, 3600]

export function summarizeActivity(raw: RawActivity, profile: Profile, id: string): Activity {
  const pts = raw.points.filter((p) => isFinite(p.t)).sort((a, b) => a.t - b.t)
  const start = new Date(raw.start)
  const date = iso(start)
  // Distanz ergänzen, falls nur Koordinaten vorliegen
  let cum = 0
  let hasDist = pts.some((p) => p.dist !== undefined)
  const withDist = pts.map((p, i) => {
    if (!hasDist && i > 0) cum += haversine(pts[i - 1], p)
    return { ...p, dist: hasDist ? (p.dist ?? cum) : cum }
  })
  if (!hasDist && cum > 0) hasDist = true
  // Bewegungszeit: Lücken über 30 s gelten als Pause
  let moving = 0
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t
    if (dt > 0 && dt <= 30) moving += dt
  }
  const durationSec = Math.round(raw.summary.durationSec ?? (moving || (pts.length ? pts[pts.length - 1].t : 0)))
  const distanceM = raw.summary.distanceM ?? (hasDist && withDist.length ? withDist[withDist.length - 1].dist : undefined)
  const hrSec = perSecond(pts, (p) => p.hr)
  const pwSec = perSecond(pts, (p) => p.pw)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
  const avgHr = raw.summary.avgHr ?? (hrSec.length ? Math.round(avg(hrSec)!) : undefined)
  const maxHr = raw.summary.maxHr ?? (hrSec.length ? Math.max(...hrSec) : undefined)
  const avgPower = raw.summary.avgPower ?? (pwSec.length ? Math.round(avg(pwSec)!) : undefined)
  const np = pwSec.length >= 30 ? Math.round(normalizedPower(pwSec)) : avgPower
  const eles = pts.map((p) => p.ele).filter((e): e is number => e !== undefined)
  const elevationM = raw.summary.elevationM ?? (eles.length > 10 ? elevationGain(eles) : undefined)
  const cads = pts.map((p) => p.cad).filter((c): c is number => c !== undefined && c > 0)

  const disc = raw.discipline
  const zoneDisc = disc === 'bike' ? 'bike' : 'run'
  const hz = hrZones(profile, zoneDisc)?.zones
  const ftp = latest(profile.ftp)?.value
  let hrZoneSec: number[] | undefined
  if (hz && hrSec.length) {
    hrZoneSec = [0, 0, 0, 0, 0]
    for (const h of hrSec) {
      const z = zoneOf(hz, h)
      hrZoneSec[Math.max(0, z - 1)]++
    }
  }
  let powerZoneSec: number[] | undefined
  if (ftp && pwSec.length && disc === 'bike') {
    const pz = powerZones(ftp)
    powerZoneSec = [0, 0, 0, 0, 0, 0, 0]
    for (const w of pwSec) powerZoneSec[Math.max(0, zoneOf(pz, w) - 1)]++
  }

  let bestEfforts: BestEffort[] | undefined
  if (disc === 'run' && hasDist && distanceM) {
    const series = withDist.map((p) => ({ t: p.t, dist: p.dist }))
    bestEfforts = RUN_BEST_DISTANCES.filter((d) => d <= distanceM + 1)
      .map((d) => ({ key: d, value: bestTimeForDistance(series, d) }))
      .filter((b): b is BestEffort => b.value !== undefined)
  }
  let powerBests: BestEffort[] | undefined
  if (disc === 'bike' && pwSec.length) {
    powerBests = POWER_BEST_WINDOWS.map((w) => ({ key: w, value: bestAverage(pwSec, w) }))
      .filter((b): b is BestEffort => b.value !== undefined)
      .map((b) => ({ key: b.key, value: Math.round(b.value) }))
  }

  // Pulsdrift: Verhältnis von Leistung bzw. Tempo zu Puls, zweite Hälfte gegen erste
  let driftPct: number | undefined
  if (durationSec >= 3600 && pts.length > 20) {
    const half = pts[pts.length - 1].t / 2
    const ef = (list: typeof withDist) => {
      const hr = avg(list.map((p) => p.hr).filter((h): h is number => h !== undefined))
      if (!hr || list.length < 2) return undefined
      const pw = avg(list.map((p) => p.pw).filter((w): w is number => w !== undefined))
      if (disc === 'bike' && pw) return pw / hr
      const d = list[list.length - 1].dist - list[0].dist
      const t = list[list.length - 1].t - list[0].t
      return d > 0 && t > 0 ? d / t / hr : undefined
    }
    const a = ef(withDist.filter((p) => p.t <= half))
    const b = ef(withDist.filter((p) => p.t > half))
    if (a && b) driftPct = Math.round(((a - b) / a) * 1000) / 10
  }

  // Belastung
  const hrMax = effectiveHrMax(profile)?.value
  const rest = profile.hrRest ?? 60
  const lthr = profile.lthr ?? (hrMax ? Math.round(rest + 0.85 * (hrMax - rest)) : undefined)
  const fit = runFitness(profile, date)
  let load = 0
  let loadSource: Activity['loadSource'] = 'duration'
  if (disc === 'bike' && ftp && np) {
    load = tssPower(durationSec, np, ftp)
    loadSource = 'power'
  } else if (avgHr && hrMax && lthr) {
    load = tssHr(durationSec, avgHr, rest, hrMax, lthr, profile.sex === 'f')
    loadSource = 'hr'
  } else if (disc === 'run' && fit && distanceM && distanceM > 0) {
    load = tssPace(durationSec, durationSec / (distanceM / 1000), pacesFromVdot(fit.vdot).T)
    loadSource = 'pace'
  } else if (raw.summary.strain) {
    load = tssRpe(durationSec, Math.min(10, raw.summary.strain / 2.1))
    loadSource = 'rpe'
  } else load = (durationSec / 3600) * 0.65 * 0.65 * 100

  // ausgedünnter Verlauf
  let stream: number[][] | undefined
  if (withDist.length > 10) {
    const step = Math.max(1, Math.ceil(withDist.length / 240))
    stream = []
    for (let i = 0; i < withDist.length; i += step) {
      const p = withDist[i]
      const q = withDist[Math.min(withDist.length - 1, i + step)]
      const speed = q.t > p.t ? (q.dist - p.dist) / (q.t - p.t) : 0
      stream.push([Math.round(p.t), p.hr ?? 0, p.pw ?? 0, Math.round(speed * 100) / 100, Math.round(p.ele ?? 0)])
    }
  }

  return {
    id,
    source: raw.format,
    fileName: raw.fileName,
    discipline: disc,
    start: raw.start,
    date,
    durationSec,
    distanceM: distanceM !== undefined ? Math.round(distanceM) : undefined,
    elevationM,
    avgHr,
    maxHr,
    avgPower,
    np,
    avgCadence: cads.length ? Math.round(avg(cads)!) : undefined,
    load: Math.round(load),
    loadSource,
    hrZoneSec,
    powerZoneSec,
    ref: { hrMax, lthr, ftp },
    bestEfforts,
    powerBests,
    driftPct,
    stream,
  }
}

export function isDuplicate(a: Activity, existing: Activity[]): boolean {
  return existing.some((e) => {
    if (e.discipline !== a.discipline && e.source !== 'manual') return false
    const dt = Math.abs(Date.parse(e.start) - Date.parse(a.start)) / 1000
    if (dt <= 120) return true
    const sameDay = e.date === a.date && e.discipline === a.discipline
    const durClose = Math.abs(e.durationSec - a.durationSec) <= Math.max(60, a.durationSec * 0.02)
    const distClose = e.distanceM && a.distanceM ? Math.abs(e.distanceM - a.distanceM) <= a.distanceM * 0.02 : !e.distanceM && !a.distanceM
    return sameDay && durClose && distClose && dt < 3 * 3600
  })
}

export interface Match {
  sessionId: string
  confidence: 'sicher' | 'möglich'
}

const fits = (s: Session, d: Discipline) => s.discipline === d || (s.kind === 'brick' && (d === 'bike' || d === 'run')) || (s.discipline === 'gym' && d === 'mobility') || (s.discipline === 'mobility' && d === 'gym')

/** Sucht die passende geplante Einheit: gleicher Tag und Sportart, bei mehreren die mit der ähnlichsten Dauer */
export function matchSession(a: Activity, sessions: Session[]): Match | undefined {
  const open = sessions.filter((s) => !s.activityId && s.status !== 'skipped' && fits(s, a.discipline))
  const closest = (list: Session[]) => [...list].sort((x, y) => Math.abs(x.durationMin * 60 - a.durationSec) - Math.abs(y.durationMin * 60 - a.durationSec))[0]
  const same = open.filter((s) => s.date === a.date)
  if (same.length) return { sessionId: closest(same).id, confidence: 'sicher' }
  const near = open.filter((s) => Math.abs(diffDays(s.date, a.date)) === 1 && s.status === 'planned')
  if (near.length) return { sessionId: closest(near).id, confidence: 'möglich' }
  return undefined
}
