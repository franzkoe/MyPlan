// Diagramme: eine Sache pro Diagramm, beschriftete Achsen, ein Satz dazu, was man sieht.
import type { ReactNode } from 'react'
import { fmtDateShort } from '../logic/dates'

const W = 328
const PAD = { l: 40, r: 8, t: 8, b: 22 }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0]
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

export function ChartFrame({ note, children, yLabel, legend }: { note?: string; children: ReactNode; yLabel?: string; legend?: { label: string; color: string; dashed?: boolean; hollow?: boolean }[] }) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      {(yLabel || legend) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] leading-4 text-ink3">
          {yLabel && <span>{yLabel}</span>}
          {legend?.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <svg width="14" height="8" aria-hidden>
                {l.hollow ? <rect x="1" y="1" width="12" height="6" rx="1" fill="none" stroke={l.color} strokeWidth="1.2" /> : l.dashed ? <line x1="0" y1="4" x2="14" y2="4" stroke={l.color} strokeWidth="1.6" strokeDasharray="3 2" /> : <rect x="0" y="1" width="14" height="6" rx="1" fill={l.color} />}
              </svg>
              {l.label}
            </span>
          ))}
        </div>
      )}
      {children}
      {note && <figcaption className="text-[13px] leading-5 text-ink2">{note}</figcaption>}
    </figure>
  )
}

export interface LineSeries {
  points: { x: number; y: number }[]
  color: string
  dashed?: boolean
  dots?: boolean
  width?: number
}

export function LineChart({
  series,
  height = 180,
  xLabels,
  fmtY = (v) => String(Math.round(v)),
  invert,
  band,
  zero,
}: {
  series: LineSeries[]
  height?: number
  xLabels: { x: number; label: string }[]
  fmtY?: (v: number) => string
  invert?: boolean
  band?: { lo: number; hi: number }
  zero?: boolean
}) {
  const all = series.flatMap((s) => s.points)
  if (!all.length) return null
  const xs = all.map((p) => p.x)
  const ys = [...all.map((p) => p.y), ...(band ? [band.lo, band.hi] : []), ...(zero ? [0] : [])]
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys))
  const y0 = ticks[0]
  const y1 = ticks[ticks.length - 1]
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const px = (x: number) => PAD.l + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw)
  const py = (y: number) => {
    const f = y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)
    return PAD.t + (invert ? f : 1 - f) * ih
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink3)" className="num">
            {fmtY(t)}
          </text>
        </g>
      ))}
      {zero && y0 < 0 && y1 > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={py(0)} y2={py(0)} stroke="var(--line-strong)" strokeWidth="1" />}
      {band && <rect x={PAD.l} width={iw} y={Math.min(py(band.lo), py(band.hi))} height={Math.abs(py(band.lo) - py(band.hi))} fill="var(--ink)" opacity="0.07" />}
      {xLabels.map((l, i) => (
        <text key={i} x={px(l.x)} y={height - 6} textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--ink3)" className="num">
          {l.label}
        </text>
      ))}
      {series.map((s, i) => (
        <g key={i}>
          {s.points.length > 1 && (
            <polyline
              points={s.points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 1.8}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {(s.dots || s.points.length === 1) && s.points.map((p, k) => <circle key={k} cx={px(p.x)} cy={py(p.y)} r="2.8" fill="var(--card)" stroke={s.color} strokeWidth="1.6" />)}
        </g>
      ))}
    </svg>
  )
}

export const dateX = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / 86400000)
export function dateLabels(dates: string[], count = 3): { x: number; label: string }[] {
  if (!dates.length) return []
  const s = [...dates].sort()
  if (s.length === 1 || s[0] === s[s.length - 1]) return [{ x: dateX(s[0]), label: fmtDateShort(s[0]) }]
  const a = dateX(s[0])
  const b = dateX(s[s.length - 1])
  return Array.from({ length: count }, (_, i) => {
    const x = Math.round(a + ((b - a) * i) / (count - 1))
    const d = new Date(x * 86400000)
    return { x, label: `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.` }
  })
}

export interface Bar {
  label: string
  /** Soll */
  plan?: number
  /** Ist */
  actual?: number
  hollow?: boolean
  highlight?: boolean
  mark?: string
}

/** Balken je Woche: Soll als Umriss, Ist gefüllt. Entlastungswochen sind als solche markiert. */
export function BarChart({ bars, height = 160, fmtY = (v) => String(Math.round(v)), onSelect }: { bars: Bar[]; height?: number; fmtY?: (v: number) => string; onSelect?: (i: number) => void }) {
  if (!bars.length) return null
  const max = Math.max(1, ...bars.map((b) => Math.max(b.plan ?? 0, b.actual ?? 0)))
  const ticks = niceTicks(0, max, 3)
  const top = ticks[ticks.length - 1]
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const slot = iw / bars.length
  const bw = Math.max(3, Math.min(18, slot - 3))
  const py = (v: number) => PAD.t + (1 - v / top) * ih
  const every = Math.ceil(bars.length / 8)
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="var(--line)" />
          <text x={PAD.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink3)" className="num">
            {fmtY(t)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const x = PAD.l + i * slot + (slot - bw) / 2
        const color = b.highlight ? 'var(--accent)' : 'var(--ink2)'
        return (
          <g key={i} onClick={onSelect ? () => onSelect(i) : undefined}>
            {onSelect && <rect x={PAD.l + i * slot} y={0} width={slot} height={height} fill="transparent" />}
            {b.plan !== undefined && b.plan > 0 && (
              <rect x={x + 0.6} y={py(b.plan)} width={bw - 1.2} height={Math.max(1, py(0) - py(b.plan))} rx="2" fill={b.actual === undefined ? (b.hollow ? 'none' : color) : 'none'} opacity={b.actual === undefined && !b.hollow ? 0.85 : 1} stroke={color} strokeWidth="1.2" strokeDasharray={b.hollow ? '2.5 2' : undefined} />
            )}
            {b.actual !== undefined && b.actual > 0 && <rect x={x + 0.6} y={py(b.actual)} width={bw - 1.2} height={Math.max(1, py(0) - py(b.actual))} rx="2" fill={color} />}
            {b.mark && (
              <text x={x + bw / 2} y={py(Math.max(b.plan ?? 0, b.actual ?? 0)) - 4} textAnchor="middle" fontSize="9" fill="var(--ink3)">
                {b.mark}
              </text>
            )}
            {(i % every === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="10" fill={b.highlight ? 'var(--accent-ink)' : 'var(--ink3)'} className="num">
                {b.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Ein gestapelter Balken für Anteile, mit Beschriftung darunter */
export function ShareBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 overflow-hidden rounded-[4px] bg-raised">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="border-r border-card last:border-0" />
        ))}
      </div>
      <div className="flex justify-between gap-1">
        {parts.map((p) => (
          <span key={p.label} className="flex min-w-0 flex-col text-[12px] leading-4 text-ink3">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="num text-ink2">{Math.round((p.value / total) * 100)} %</span>
          </span>
        ))}
      </div>
    </div>
  )
}
