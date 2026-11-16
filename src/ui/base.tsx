import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { seenTerm, useStore } from '../store'
import { TERMS } from './terms'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

export function Button({
  children,
  onClick,
  kind = 'secondary',
  disabled,
  full,
  small,
  type = 'button',
  label,
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger'
  disabled?: boolean
  full?: boolean
  small?: boolean
  type?: 'button' | 'submit'
  label?: string
}) {
  const styles = {
    primary: 'bg-primary text-on-primary',
    secondary: 'bg-raised text-ink border border-line',
    quiet: 'text-ink2',
    danger: 'bg-raised text-bad border border-line',
  }[kind]
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx('press inline-flex items-center justify-center gap-2 rounded-[10px] font-medium', small ? 'h-10 px-3 text-[14px]' : 'h-12 px-4', full && 'w-full', styles, disabled && 'opacity-40')}
    >
      {children}
    </button>
  )
}

export function Card({ children, className, onClick, label }: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  const cls = cx('block w-full rounded-[14px] border border-line bg-card p-4 text-left shadow-[var(--shadow)]', onClick && 'press', className)
  return onClick ? (
    <button aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  )
}

export function Page({ title, back, action, children, sub }: { title: string; back?: boolean | string; action?: ReactNode; children: ReactNode; sub?: string }) {
  const nav = useNavigate()
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col px-4 pb-28 pt-[max(env(safe-area-inset-top),12px)]">
      <header className="flex min-h-14 items-center gap-2 py-2">
        {back && (
          <button aria-label="Zurück" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-[10px] text-ink2">
            <ChevronLeft size={22} strokeWidth={1.5} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-medium leading-7">{title}</h1>
          {sub && <p className="truncate text-[13px] leading-5 text-ink3">{sub}</p>}
        </div>
        {action}
      </header>
      <div className="enter flex flex-col gap-4">{children}</div>
    </div>
  )
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {(title || action) && (
        <div className="mt-2 flex min-h-8 items-end justify-between">
          <h2 className="text-[13px] font-medium leading-5 text-ink3">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.dataset.sheet = String(Number(document.body.dataset.sheet ?? 0) + 1)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.dataset.sheet = String(Math.max(0, Number(document.body.dataset.sheet ?? 1) - 1))
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Schließen" className="fade-in absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[92%] w-full max-w-[560px] flex-col rounded-t-[18px] border border-b-0 border-line bg-card">
        <div className="flex min-h-14 items-center gap-2 border-b border-line px-4">
          <h2 className="flex-1 text-[17px] font-medium">{title}</h2>
          <button aria-label="Schließen" onClick={onClose} className="press -mr-2 flex h-11 w-11 items-center justify-center rounded-[10px] text-ink2">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),20px)]">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint, error, source }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string; source?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-[13px] leading-5 text-ink2">
        <span>{label}</span>
        {source && <span className="text-[12px] text-ink3">{source}</span>}
      </span>
      {children}
      {error ? <span className="text-[13px] leading-5 text-bad">{error}</span> : hint ? <span className="text-[13px] leading-5 text-ink3">{hint}</span> : null}
    </div>
  )
}

const inputCls = 'h-12 w-full rounded-[10px] border border-line bg-raised px-3 outline-none focus:border-line-strong'

export function TextInput({ value, onChange, placeholder, mode, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'numeric' | 'decimal' | 'text'; type?: string }) {
  return <input className={cx(inputCls, mode && 'num')} type={type} inputMode={mode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

/** Zahlenfeld, das Komma und Punkt annimmt und leer bleiben darf */
export function NumInput({ value, onChange, placeholder, unit, decimal }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; unit?: string; decimal?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', ','))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setText(value === undefined ? '' : String(value).replace('.', ','))
    }
  }, [value])
  return (
    <div className="relative">
      <input
        className={cx(inputCls, 'num', unit && 'pr-16')}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.]/g, '')
          setText(t)
          const n = t === '' ? undefined : Number(t.replace(',', '.'))
          const v = n !== undefined && isFinite(n) ? n : undefined
          last.current = v
          onChange(v)
        }}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink3">{unit}</span>}
    </div>
  )
}

export function Select<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="relative">
      <select
        className={cx(inputCls, 'appearance-none pr-9')}
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value)
          if (hit) onChange(hit.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight size={18} strokeWidth={1.5} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-ink3" />
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-[10px] border border-line bg-raised p-1" role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('press h-10 min-w-0 flex-1 truncate rounded-[6px] px-2 text-[14px]', o.value === value ? 'bg-card font-medium text-ink shadow-[var(--shadow)]' : 'text-ink2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ values, onToggle, options }: { values: T[]; onToggle: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value)
        return (
          <button
            key={String(o.value)}
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cx('press h-11 rounded-[10px] border px-3 text-[14px]', on ? 'border-ink bg-primary font-medium text-on-primary' : 'border-line bg-raised text-ink2')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Row({ title, sub, right, onClick, left }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; left?: ReactNode }) {
  const inner = (
    <>
      {left}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {sub && <span className="block truncate text-[13px] leading-5 text-ink3">{sub}</span>}
      </span>
      {right}
      {onClick && <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-ink3" />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left'
  return onClick ? (
    <button onClick={onClick} className={cx(cls, 'press')}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">{children}</div>
}

export function Note({ children, tone = 'info', action }: { children: ReactNode; tone?: 'info' | 'warn' | 'bad' | 'good'; action?: ReactNode }) {
  const bar = { info: 'bg-ink3', warn: 'bg-steady', bad: 'bg-bad', good: 'bg-good' }[tone]
  return (
    <div className="flex gap-3 rounded-[10px] border border-line bg-raised p-3">
      <span className={cx('w-[3px] shrink-0 rounded-full', bar)} />
      <div className="min-w-0 flex-1 text-[14px] leading-5 text-ink2">
        {children}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-line-strong p-5">
      <div>
        <p className="font-medium">{title}</p>
        {text && <p className="mt-1 text-[14px] leading-5 text-ink2">{text}</p>}
      </div>
      {action}
    </div>
  )
}

/** Fachbegriff: beim ersten Auftreten mit Erklärung, danach auf Antippen */
export function Term({ id, children }: { id: keyof typeof TERMS; children?: ReactNode }) {
  const seen = useStore((s) => s.data.profile.seenTerms.includes(id))
  const [first] = useState(!seen)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (first) seenTerm(id)
  }, [first, id])
  const t = TERMS[id]
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className="underline decoration-line-strong decoration-dotted underline-offset-4"
      >
        {children ?? t.name}
      </button>
      {first && <span className="text-ink3"> ({t.short})</span>}
      <Sheet open={open} onClose={() => setOpen(false)} title={t.name}>
        <p className="text-ink2">{t.text}</p>
      </Sheet>
    </>
  )
}

export function Stat({ label, value, sub, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="block text-[13px] leading-5 text-ink3">{label}</span>
      <span className="num mt-1 block text-[24px] font-medium leading-7">{value}</span>
      {sub && <span className="mt-1 block text-[13px] leading-5 text-ink2">{sub}</span>}
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="press min-w-0 flex-1 rounded-[14px] border border-line bg-card p-4 text-left shadow-[var(--shadow)]">
      {inner}
    </button>
  ) : (
    <div className="min-w-0 flex-1 rounded-[14px] border border-line bg-card p-4 shadow-[var(--shadow)]">{inner}</div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const undo = useStore((s) => s.undo)
  const clear = useStore((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clear, toast.undo ? 4500 : 3000)
    return () => clearTimeout(t)
  }, [toast, clear])
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <div key={toast.id} role="status" className="enter pointer-events-auto flex min-h-12 max-w-[528px] items-center gap-3 rounded-[10px] bg-primary px-4 text-[14px] text-on-primary shadow-[0_8px_24px_rgb(0_0_0/0.18)]">
        <span className="py-2">{toast.text}</span>
        {toast.undo && (
          <button onClick={undo} className="press -mr-2 h-10 rounded-[6px] px-2 font-medium underline underline-offset-4">
            Rückgängig
          </button>
        )}
      </div>
    </div>
  )
}

export function Confirm({ open, title, text, confirm, onConfirm, onClose, danger }: { open: boolean; title: string; text: string; confirm: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-ink2">{text}</p>
      <div className="flex gap-2">
        <Button full onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          full
          kind={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirm}
        </Button>
      </div>
    </Sheet>
  )
}

export function Stepper({ value, onChange, min, max, step = 1, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <div className="flex h-12 items-center rounded-[10px] border border-line bg-raised">
      <button aria-label="Weniger" onClick={() => set(value - step)} className="press h-12 w-12 text-[20px] text-ink2" disabled={value <= min}>
        −
      </button>
      <span className="num flex-1 text-center">{format ? format(value) : value}</span>
      <button aria-label="Mehr" onClick={() => set(value + step)} className="press h-12 w-12 text-[20px] text-ink2" disabled={value >= max}>
        +
      </button>
    </div>
  )
}
