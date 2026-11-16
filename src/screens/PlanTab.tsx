import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, fmtDate, fmtDay, isoWeek, MONTHS, parse, today, WEEKDAYS_SHORT, weekday } from '../logic/dates'
import type { Conflict } from '../logic/plans'
import { SPORT_NAME } from '../logic/templates'
import type { Discipline, Session } from '../logic/types'
import { PRESETS } from '../presets'
import { addSession, alignDeloads, applyRecalc, completeSession, dismiss, freePlanId, mainPlanId, moveSession, reopenSession, updateSession, useStore, weekStartOf } from '../store'
import { Button, Card, cx, Empty, List, Note, Page, Row, Section, Segmented, Sheet } from '../ui/base'
import { DISC_NAME, KindMark, SportIcon } from '../ui/marks'
import { SessionRow, StripLegend, WeekStrip } from '../ui/session'
import { conflictsFor, fmtVol, planProgress, planWeekStatus, weekSessions } from '../view'

export default function PlanTab() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const t = today()
  const [ws, setWs] = useState(weekStartOf(data, t))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [addDay, setAddDay] = useState<string | undefined>()
  const [preset, setPreset] = useState<string | undefined>()
  const week = weekSessions(data, ws)
  const plans = data.plans.filter((p) => p.templateId !== 'frei')
  const current = plans.filter((p) => p.status === 'active' || p.status === 'paused')
  const archive = plans.filter((p) => p.status === 'done' || p.status === 'ended')
  const statuses = current.map((p) => planWeekStatus(data, p, ws)).filter((x) => !!x)
  const conflicts = conflictsFor(data, ws)
  const multi = current.length > 1
  const planName = (s: Session) => (multi ? data.plans.find((p) => p.id === s.planId)?.name : undefined)

  useEffect(() => {
    const neu = params.get('neu')
    const tag = params.get('tag')
    if (neu && tag) {
      setWs(weekStartOf(data, tag))
      setAddDay(tag)
      setPreset(neu)
      setParams({}, { replace: true })
    }
  }, [])

  const apply = (c: Conflict) => {
    if (c.action === 'move' && c.sessionId && c.moveTo) moveSession(c.sessionId, c.moveTo)
    else if (c.action === 'skip' && c.sessionId) updateSession(c.sessionId, (s) => { s.status = 'skipped' }, 'Einheit ausgelassen')
    else if (c.action === 'alignDeload') {
      const main = mainPlanId(data)
      for (const p of data.plans.filter((x) => x.status === 'active' && !x.config.single && x.id !== main)) {
        const cfg = alignDeloads(useStore.getState().data, p.id)
        if (cfg) applyRecalc(p.id, cfg, false, 'Entlastungswochen angeglichen (ab nächster Woche)')
      }
    }
  }

  return (
    <Page
      title="Plan"
      action={
        <Button small kind="primary" onClick={() => nav('/plan/neu')}>
          <Plus size={18} strokeWidth={1.5} /> Neuer Plan
        </Button>
      }
    >
      <Segmented value={view} onChange={setView} options={[{ value: 'week', label: 'Woche' }, { value: 'month', label: 'Monat' }]} />

      {view === 'week' ? (
        <>
          <Card>
            <div className="mb-3 flex items-center gap-1">
              <button aria-label="Vorige Woche" className="press flex h-11 w-11 items-center justify-center rounded-[10px] text-ink2" onClick={() => setWs(addDays(ws, -7))}>
                <ChevronLeft size={20} strokeWidth={1.5} />
              </button>
              <button className="press min-w-0 flex-1 text-center" onClick={() => setWs(weekStartOf(data, t))}>
                <span className="block font-medium">{ws === weekStartOf(data, t) ? 'Diese Woche' : `Woche ${isoWeek(ws)}`}</span>
                <span className="num block text-[13px] leading-5 text-ink3">
                  {fmtDate(ws)} bis {fmtDate(addDays(ws, 6))}
                </span>
              </button>
              <button aria-label="Nächste Woche" className="press flex h-11 w-11 items-center justify-center rounded-[10px] text-ink2" onClick={() => setWs(addDays(ws, 7))}>
                <ChevronRight size={20} strokeWidth={1.5} />
              </button>
            </div>
            <WeekStrip weekStart={ws} sessions={week} />
            <div className="mt-3">
              <StripLegend />
            </div>
            {statuses.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
                {statuses.map((s) => (
                  <button key={s.plan.id} className="press flex items-baseline justify-between gap-3 text-left" onClick={() => nav(`/plan/${s.plan.id}`)}>
                    <span className="min-w-0 truncate text-[14px] text-ink2">
                      {s.plan.name}
                      {s.deload ? ' · Entlastung' : s.taper ? ' · Tapering' : ''}
                    </span>
                    <span className="num shrink-0 text-[14px]">
                      <span className="font-medium">{fmtVol(s.actual, s.unit)}</span>
                      <span className="text-ink3"> von {fmtVol(s.planned, s.unit)} {s.unit}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {conflicts.map((c) => (
            <Note
              key={c.id}
              tone={c.severity === 'warn' ? 'warn' : 'info'}
              action={
                <>
                  {c.action && <Button small kind="primary" onClick={() => apply(c)}>Vorschlag übernehmen</Button>}
                  <Button small kind="quiet" onClick={() => dismiss(c.id)}>So lassen</Button>
                </>
              }
            >
              <span className="font-medium text-ink">{c.text}.</span> {c.reason}
            </Note>
          ))}

          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
            const list = week.filter((s) => s.date === d)
            return (
              <Section
                key={d}
                title={`${fmtDay(d)}${d === t ? ' · heute' : ''}`}
                action={
                  <button aria-label={`Einheit am ${fmtDay(d)} hinzufügen`} className="press -mr-2 flex h-8 w-11 items-center justify-center text-ink3" onClick={() => { setPreset(undefined); setAddDay(d) }}>
                    <Plus size={18} strokeWidth={1.5} />
                  </button>
                }
              >
                {list.length ? (
                  <List>
                    {list.map((s) => (
                      <SessionRow key={s.id} s={s} planName={planName(s)} onCheck={() => (s.status === 'done' ? reopenSession(s.id) : completeSession(s.id))} />
                    ))}
                  </List>
                ) : (
                  <p className="px-1 text-[14px] text-ink3">Frei</p>
                )}
              </Section>
            )
          })}
        </>
      ) : (
        <Month data={data} anchor={ws} onPick={(d) => { setWs(weekStartOf(data, d)); setView('week') }} onShift={(n) => { const x = parse(ws); x.setDate(15); x.setMonth(x.getMonth() + n); setWs(weekStartOf(data, `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-15`)) }} />
      )}

      <Section title="Aktive Pläne">
        {current.length === 0 ? (
          <Empty title="Noch kein Plan" text="Wähle eine Vorlage, eine einzelne Woche oder baue einen eigenen Plan" action={<Button kind="primary" onClick={() => nav('/plan/neu')}>Plan anlegen</Button>} />
        ) : (
          <List>
            {current.map((p) => {
              const pr = planProgress(data, p)
              return <Row key={p.id} left={<SportIcon d={p.config.sport} />} title={p.name} sub={`${pr.sentence} · ${p.config.single ? 'einzelne Woche' : pr.detail}`} onClick={() => nav(`/plan/${p.id}`)} />
            })}
          </List>
        )}
      </Section>
      {archive.length > 0 && (
        <Section title="Archiv">
          <List>
            {archive.map((p) => (
              <Row key={p.id} left={<SportIcon d={p.config.sport} />} title={p.name} sub={`${SPORT_NAME[p.config.sport]} · ${p.status === 'done' ? 'abgeschlossen' : 'vorzeitig beendet'} · ab ${fmtDate(p.config.startDate, true)}`} onClick={() => nav(`/plan/${p.id}`)} />
            ))}
          </List>
        </Section>
      )}

      <AddSheet day={addDay} preset={preset} onClose={() => setAddDay(undefined)} />
    </Page>
  )
}

function Month({ data, anchor, onPick, onShift }: { data: ReturnType<typeof useStore.getState>['data']; anchor: string; onPick: (d: string) => void; onShift: (n: number) => void }) {
  const mid = parse(addDays(anchor, 3))
  const first = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-01`
  const start = weekStartOf(data, first)
  const t = today()
  const ids = new Set(data.plans.filter((p) => p.status !== 'paused').map((p) => p.id))
  const byDay = new Map<string, Session[]>()
  for (const s of data.sessions) if (ids.has(s.planId)) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1">
        <button aria-label="Voriger Monat" className="press flex h-11 w-11 items-center justify-center text-ink2" onClick={() => onShift(-1)}>
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="flex-1 text-center font-medium">
          {MONTHS[mid.getMonth()]} {mid.getFullYear()}
        </span>
        <button aria-label="Nächster Monat" className="press flex h-11 w-11 items-center justify-center text-ink2" onClick={() => onShift(1)}>
          <ChevronRight size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] leading-6 text-ink3">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{WEEKDAYS_SHORT[weekday(addDays(start, i))]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const list = byDay.get(d) ?? []
          const inMonth = parse(d).getMonth() === mid.getMonth()
          return (
            <button key={d} aria-label={`${fmtDay(d)}: ${list.length ? list.map((s) => s.title).join('; ') : 'frei'}`} onClick={() => onPick(d)} className={cx('press flex h-14 flex-col items-center gap-1 rounded-[8px] pt-1', !inMonth && 'opacity-35')}>
              <span className={cx('num flex h-6 w-6 items-center justify-center rounded-full text-[13px]', d === t ? 'bg-primary font-medium text-on-primary' : 'text-ink2')}>{parse(d).getDate()}</span>
              <span className="flex gap-0.5">
                {list.slice(0, 3).map((s) => (
                  <KindMark key={s.id} kind={s.kind} done={s.status === 'done'} skipped={s.status === 'skipped'} size={11} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[13px] leading-5 text-ink3">Gefüllte Zeichen sind erledigt, Umrisse geplant. Tag antippen öffnet die Woche</p>
    </Card>
  )
}

function AddSheet({ day, preset, onClose }: { day?: string; preset?: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const [disc, setDisc] = useState<Discipline>('run')
  useEffect(() => {
    if (!day) return
    const hit = preset ? (Object.keys(PRESETS) as Discipline[]).find((d) => PRESETS[d].some((p) => p.spec.builder === preset)) : undefined
    const first = data.profile.sports[0]
    setDisc(hit ?? (first === 'tri' || !first ? 'run' : (first as Discipline)))
  }, [day, preset])
  if (!day) return null
  const list = PRESETS[disc].filter((p) => !preset || p.spec.builder === preset || !PRESETS[disc].some((x) => x.spec.builder === preset))
  const target = () => {
    const sportOf = (d: Discipline) => (d === 'mobility' ? 'gym' : d)
    const hit = data.plans.find((p) => p.status === 'active' && !p.config.single && (p.config.sport === sportOf(disc) || (p.config.sport === 'tri' && disc !== 'gym' && disc !== 'mobility')) && p.config.startDate <= day)
    return hit?.id ?? freePlanId()
  }
  return (
    <Sheet open onClose={onClose} title={`Einheit hinzufügen, ${fmtDay(day)}`}>
      <Segmented value={disc} onChange={setDisc} options={(['run', 'bike', 'swim', 'gym', 'mobility'] as Discipline[]).map((d) => ({ value: d, label: DISC_NAME[d] }))} />
      <List>
        {list.map((p) => (
          <Row
            key={p.label}
            title={p.label}
            onClick={() => {
              addSession(target(), day, p.spec)
              onClose()
            }}
          />
        ))}
      </List>
      <p className="text-[13px] leading-5 text-ink3">Die Einheit lässt sich danach bearbeiten. Sie bleibt bei einer Neuberechnung des Plans erhalten</p>
    </Sheet>
  )
}
