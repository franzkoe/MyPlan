// Feste Bedeutung von Formen und Farben in der ganzen App.
// Form = Art der Einheit, Farbe = Intensität (grau locker, ocker zügig, rot hart, blau Kraft).
// Gefüllt = erledigt, Umriss = geplant. Nie nur über Farbe unterschieden.
import { Bike, Dumbbell, Footprints, Layers, StretchHorizontal, Waves } from 'lucide-react'
import type { Discipline, Kind, Session, Sport } from '../logic/types'

export type Tone = 'easy' | 'steady' | 'hard' | 'strength'

export const KIND: Record<Kind, { label: string; tone: Tone; shape: string }> = {
  easy: { label: 'Grundlage', tone: 'easy', shape: 'circle' },
  long: { label: 'Lange Einheit', tone: 'easy', shape: 'bar' },
  recovery: { label: 'Regeneration', tone: 'easy', shape: 'dot' },
  technique: { label: 'Technik', tone: 'easy', shape: 'ring' },
  mobility: { label: 'Mobilität', tone: 'easy', shape: 'ring' },
  tempo: { label: 'Tempo', tone: 'steady', shape: 'diamond' },
  threshold: { label: 'Schwelle', tone: 'steady', shape: 'square' },
  hills: { label: 'Berg', tone: 'steady', shape: 'ramp' },
  brick: { label: 'Koppeleinheit', tone: 'steady', shape: 'double' },
  intervals: { label: 'Intervalle', tone: 'hard', shape: 'triangle' },
  test: { label: 'Test', tone: 'hard', shape: 'target' },
  race: { label: 'Wettkampf', tone: 'hard', shape: 'flag' },
  strength: { label: 'Kraft', tone: 'strength', shape: 'plus' },
}

export const TONE_VAR: Record<Tone, string> = { easy: 'var(--easy)', steady: 'var(--steady)', hard: 'var(--hard)', strength: 'var(--strength)' }
export const TONE_LABEL: Record<Tone, string> = { easy: 'locker', steady: 'zügig', hard: 'hart', strength: 'Kraft' }
export const ZONE_VAR = ['var(--line-strong)', 'var(--easy)', 'color-mix(in srgb, var(--steady) 55%, var(--easy))', 'var(--steady)', 'var(--hard)', 'var(--hard)', 'var(--hard)']

export function KindMark({ kind, done, size = 16, skipped }: { kind: Kind; done?: boolean; size?: number; skipped?: boolean }) {
  const k = KIND[kind]
  const c = skipped ? 'var(--ink3)' : TONE_VAR[k.tone]
  const fill = done ? c : 'none'
  const p = { stroke: c, strokeWidth: 1.6, fill, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  const shape = () => {
    switch (k.shape) {
      case 'circle':
        return <circle cx="8" cy="8" r="5.2" {...p} />
      case 'dot':
        return <circle cx="8" cy="8" r="3" {...p} />
      case 'ring':
        return (
          <>
            <circle cx="8" cy="8" r="5.2" {...p} fill="none" />
            <circle cx="8" cy="8" r="1.6" fill={c} />
          </>
        )
      case 'bar':
        return <rect x="1.8" y="5" width="12.4" height="6" rx="3" {...p} />
      case 'square':
        return <rect x="3" y="3" width="10" height="10" rx="1.5" {...p} />
      case 'diamond':
        return <path d="M8 2.2 13.8 8 8 13.8 2.2 8Z" {...p} />
      case 'triangle':
        return <path d="M8 2.6 14 13H2Z" {...p} />
      case 'ramp':
        return <path d="M2.5 13h11V4Z" {...p} />
      case 'double':
        return (
          <>
            <rect x="1.8" y="5" width="7" height="6" rx="1.5" {...p} />
            <circle cx="12" cy="8" r="2.4" {...p} />
          </>
        )
      case 'target':
        return (
          <>
            <circle cx="8" cy="8" r="5.4" {...p} fill="none" />
            <circle cx="8" cy="8" r="2.2" fill={c} />
          </>
        )
      case 'flag':
        return (
          <>
            <path d="M4 14V2.5" {...p} fill="none" />
            <path d="M4 3h8.5l-2.2 3 2.2 3H4Z" {...p} />
          </>
        )
      default:
        return (
          <>
            <path d="M8 3v10M3 8h10" {...p} strokeWidth={done ? 3.2 : 1.6} fill="none" />
          </>
        )
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0" style={skipped ? { opacity: 0.6 } : undefined}>
      {shape()}
    </svg>
  )
}

export const DISC_NAME: Record<Discipline, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', gym: 'Kraft', mobility: 'Mobilität' }

export function SportIcon({ d, size = 18 }: { d: Discipline | Sport; size?: number }) {
  const p = { size, strokeWidth: 1.5, className: 'shrink-0 text-ink3', 'aria-hidden': true }
  if (d === 'run') return <Footprints {...p} />
  if (d === 'bike') return <Bike {...p} />
  if (d === 'swim') return <Waves {...p} />
  if (d === 'gym') return <Dumbbell {...p} />
  if (d === 'tri') return <Layers {...p} />
  return <StretchHorizontal {...p} />
}

export function sessionMeta(s: Pick<Session, 'durationMin' | 'distanceKm' | 'discipline' | 'gym' | 'elevationM'>): string {
  const parts: string[] = []
  const m = Math.round(s.durationMin)
  parts.push(m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`)
  if (s.distanceKm) parts.push(s.discipline === 'swim' ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toLocaleString('de-DE')} km`)
  if (s.elevationM) parts.push(`${s.elevationM} Hm`)
  if (s.gym) parts.push(`${s.gym.reduce((a, g) => a + g.sets, 0)} Sätze`)
  return parts.join(' · ')
}
