import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { addDays, today, WEEKDAYS_SHORT, weekday } from '../logic/dates'
import type { Session } from '../logic/types'
import { cx } from './base'
import { KIND, KindMark, sessionMeta, SportIcon, TONE_VAR } from './marks'

/** Eine Einheit als Zeile. Sieht überall gleich aus und führt immer zur Einheit. */
export function SessionRow({ s, onCheck, showDate, planName }: { s: Session; onCheck?: () => void; showDate?: boolean; planName?: string }) {
  const nav = useNavigate()
  const done = s.status === 'done'
  const skipped = s.status === 'skipped'
  return (
    <div className="flex min-h-16 items-stretch">
      <button onClick={() => nav(`/einheit/${encodeURIComponent(s.id)}`)} className="press flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-2 text-left">
        <KindMark kind={s.kind} done={done} skipped={skipped} size={18} />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate', skipped && 'text-ink3 line-through')}>{s.title}</span>
          <span className="flex items-center gap-1.5 truncate text-[13px] leading-5 text-ink3">
            <SportIcon d={s.discipline} size={14} />
            <span className="truncate">
              {showDate ? `${WEEKDAYS_SHORT[weekday(s.date)]} · ` : ''}
              {KIND[s.kind].label} · {sessionMeta(s)}
              {s.timeOfDay ? ` · ${s.timeOfDay}` : ''}
              {s.adjusted ? ' · angepasst' : s.manual ? ' · geändert' : ''}
              {planName ? ` · ${planName}` : ''}
            </span>
          </span>
        </span>
      </button>
      {onCheck && !skipped && (
        <button
          aria-label={done ? 'Erledigt. Antippen, um wieder zu öffnen' : 'Als erledigt abhaken'}
          onClick={onCheck}
          className="press flex w-14 shrink-0 items-center justify-center"
        >
          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full border', done ? 'border-transparent bg-primary text-on-primary' : 'border-line-strong text-transparent')}>
            <Check size={16} strokeWidth={2} />
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * Wochenstreifen, das Erkennungszeichen der App: sieben Tage, jede Einheit ein Balken.
 * Höhe = Dauer, Farbe = Intensität, gefüllt = erledigt, schraffiert = geplant.
 */
export function WeekStrip({ weekStart, sessions, selected, onSelect, height = 64 }: { weekStart: string; sessions: Session[]; selected?: string; onSelect?: (date: string) => void; height?: number }) {
  const t = today()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const total = (d: string) => sessions.filter((s) => s.date === d && s.status !== 'skipped').reduce((a, s) => a + s.durationMin, 0)
  const max = Math.max(90, ...days.map(total))
  return (
    <div className="flex items-end gap-1">
      {days.map((d) => {
        const list = sessions.filter((s) => s.date === d)
        const isToday = d === t
        const label = `${WEEKDAYS_SHORT[weekday(d)]}: ${list.length ? list.map((s) => `${s.title}${s.status === 'done' ? ', erledigt' : ''}`).join('; ') : 'frei'}`
        const body = (
          <>
            <span className="flex w-full flex-col-reverse items-center gap-0.5" style={{ height }}>
              {list.length === 0 && <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />}
              {list.map((s) => {
                const h = Math.max(6, Math.round((s.durationMin / max) * height) - (list.length - 1) * 2)
                const c = TONE_VAR[KIND[s.kind].tone]
                const st = s.status
                return (
                  <span
                    key={s.id}
                    className={cx('w-full max-w-7 rounded-[3px]', st === 'planned' && 'hatch border')}
                    style={{ height: h, color: c, borderColor: c, background: st === 'done' ? c : undefined, opacity: st === 'skipped' ? 0.25 : d < t && st === 'planned' ? 0.55 : 1, border: st === 'skipped' ? `1px dashed ${c}` : undefined }}
                  />
                )
              })}
            </span>
            <span className={cx('num mt-1.5 flex h-6 w-full items-center justify-center rounded-[6px] text-[12px]', isToday ? 'bg-primary font-medium text-on-primary' : selected === d ? 'bg-raised text-ink' : 'text-ink3')}>{WEEKDAYS_SHORT[weekday(d)]}</span>
          </>
        )
        return onSelect ? (
          <button key={d} aria-label={label} onClick={() => onSelect(d)} className="press flex min-w-0 flex-1 flex-col items-center">
            {body}
          </button>
        ) : (
          <div key={d} role="img" aria-label={label} className="flex min-w-0 flex-1 flex-col items-center">
            {body}
          </div>
        )
      })}
    </div>
  )
}

export function StripLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-ink3">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-easy" /> locker
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-steady" /> zügig
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-hard" /> hart
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-strength" /> Kraft
      </span>
      <span className="flex items-center gap-1.5">
        <span className="hatch h-2.5 w-2.5 rounded-[2px] border border-ink3 text-ink3" /> geplant
      </span>
    </div>
  )
}
