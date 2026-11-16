import { FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { headline, testsDue } from '../logic/analysis'
import { addDays, fmtDay, today, WEEKDAYS, weekday } from '../logic/dates'
import { exerciseName } from '../logic/exercises'
import { overuse, recoveryDue } from '../logic/recovery'
import { SPORT_NAME } from '../logic/templates'
import type { Session, Sport } from '../logic/types'
import { completeSession, dismiss, reopenSession, sessionSteps, useStore, weekStartOf } from '../store'
import { Button, Card, cx, Empty, List, Note, Page, Section, Term } from '../ui/base'
import { KIND, KindMark, sessionMeta, SportIcon } from '../ui/marks'
import { SessionRow, StripLegend, WeekStrip } from '../ui/session'
import { activePlans, conflictsFor, fmtVol, planProgress, planWeekStatus, weekSessions } from '../view'
import NotRecoveredSheet from './NotRecoveredSheet'

const TREND_WORD = { better: 'besser', same: 'gleich', worse: 'schlechter', nodata: 'offen' } as const

export default function Today() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const t = today()
  const ws = weekStartOf(data, t)
  const week = weekSessions(data, ws)
  const todays = week.filter((s) => s.date === t)
  const plans = activePlans(data).filter((p) => p.templateId !== 'frei')
  const paused = data.plans.filter((p) => p.status === 'paused')
  const [nr, setNr] = useState<Session | undefined>()
  const due = data.profile.reminder.enabled && recoveryDue(data.recovery, t, data.profile.reminder.weekday, data.profile.weekStart)
  const statuses = plans.map((p) => planWeekStatus(data, p, ws)).filter((x) => !!x)
  const deload = statuses.some((s) => s.deload)
  const taper = statuses.some((s) => s.taper)
  const next = data.sessions.filter((s) => s.date > t && s.status === 'planned' && plans.some((p) => p.id === s.planId)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const tests = testsDue(data.profile, t).filter((x) => !data.dismissed.includes(x.id))
  const conflicts = conflictsFor(data, ws).filter((c) => c.severity === 'warn')
  const over = overuse(data.readiness, t)
  const sports = (data.profile.sports.length ? data.profile.sports : [...new Set(plans.map((p) => p.config.sport))]) as Sport[]
  const openPast = week.filter((s) => s.date < t && s.status === 'planned')
  const check = (s: Session) => (s.status === 'done' ? reopenSession(s.id) : completeSession(s.id))
  const planName = (s: Session) => (plans.length > 1 ? data.plans.find((p) => p.id === s.planId)?.name : undefined)

  return (
    <Page
      title={fmtDay(t)}
      sub={statuses.length ? [...new Set(statuses.map((s) => `${s.plan.config.single ? s.plan.name : `Woche ${s.weekIndex + 1} von ${s.plan.config.weeks}`}`))].slice(0, 2).join(' · ') + (deload ? ' · Entlastungswoche' : taper ? ' · Tapering' : '') : undefined}
      action={
        <button aria-label="Datei importieren" onClick={() => nav('/import')} className="press flex h-11 items-center gap-2 rounded-[10px] border border-line bg-raised px-3 text-[14px]">
          <FileUp size={18} strokeWidth={1.5} className="text-ink3" /> Import
        </button>
      }
    >
      {due && (
        <Note tone="warn" action={<Button small kind="primary" onClick={() => nav('/erholung')}>Jetzt eintragen</Button>}>
          <span className="font-medium text-ink">Erholungsdaten der Woche sind fällig.</span> HRV, Ruhepuls und Schlaf eintragen dauert eine Minute
        </Note>
      )}
      {paused.map((p) => (
        <Note key={p.id} action={<Button small onClick={() => nav(`/plan/${p.id}`)}>Zum Plan</Button>}>
          „{p.name}“ ist pausiert. Beim Fortsetzen schlägt die App einen angepassten Wiedereinstieg vor
        </Note>
      ))}

      {plans.length === 0 && paused.length === 0 ? (
        <Empty title="Noch kein Plan" text="Wähle eine Vorlage oder baue einen eigenen Plan. Danach steht hier, was heute ansteht" action={<Button kind="primary" onClick={() => nav('/plan/neu')}><Plus size={18} strokeWidth={1.5} /> Plan anlegen</Button>} />
      ) : (
        <Section title="Heute">
          {todays.length === 0 ? (
            <Card>
              <p className="text-[18px] font-medium leading-6">Heute ist frei</p>
              <p className="mt-1 text-[14px] leading-5 text-ink2">{next ? `Als Nächstes am ${fmtDay(next.date)}: ${next.title}` : 'Es stehen keine weiteren Einheiten an'}</p>
            </Card>
          ) : (
            todays.map((s) => {
              const steps = sessionSteps(data, s)
              const main = steps.find((x) => x.part === 'Hauptteil') ?? steps[0]
              const done = s.status === 'done'
              const skipped = s.status === 'skipped'
              return (
                <Card key={s.id}>
                  <button className="press block w-full text-left" onClick={() => nav(`/einheit/${encodeURIComponent(s.id)}`)}>
                    <span className="flex items-center gap-2 text-[13px] leading-5 text-ink3">
                      <KindMark kind={s.kind} done={done} skipped={skipped} />
                      <span>{KIND[s.kind].label}</span>
                      <SportIcon d={s.discipline} size={14} />
                      <span className="num">{sessionMeta(s)}</span>
                    </span>
                    <span className={cx('mt-2 block text-[19px] font-medium leading-6', skipped && 'text-ink3 line-through')}>{s.title}</span>
                    {!skipped && (s.gym ? <span className="mt-2 line-clamp-3 block text-[14px] leading-5 text-ink2">{s.gym.map((g) => `${exerciseName(g.exerciseId, data.customExercises)} ${g.sets} × ${g.reps}`).join(', ')}</span> : main && <span className="mt-2 line-clamp-3 block text-[14px] leading-5 text-ink2">{main.text}</span>)}
                    {s.adjusted && <span className="mt-2 block text-[13px] leading-5 text-ink3">Angepasst: {s.adjusted.reason}. Ursprünglich „{s.adjusted.originalTitle}“</span>}
                    {planName(s) && <span className="mt-1 block text-[13px] leading-5 text-ink3">{planName(s)}</span>}
                  </button>
                  {!skipped && (
                    <div className="mt-4 flex gap-2">
                      {done ? (
                        <Button full onClick={() => nav(`/einheit/${encodeURIComponent(s.id)}`)}>Erledigt. Ansehen</Button>
                      ) : (
                        <>
                          <Button full kind="primary" onClick={() => completeSession(s.id)}>Erledigt</Button>
                          <Button full onClick={() => setNr(s)}>Nicht gut erholt</Button>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </Section>
      )}

      {(week.length > 0 || plans.length > 0) && (
        <Section title="Diese Woche" action={<button className="press h-8 text-[13px] text-ink2 underline decoration-line-strong underline-offset-4" onClick={() => nav('/plan')}>Zur Woche</button>}>
          <Card>
            <WeekStrip weekStart={ws} sessions={week} />
            <div className="mt-3">
              <StripLegend />
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
              {statuses.map((s) => (
                <button key={s.plan.id} onClick={() => nav(`/plan/${s.plan.id}`)} className="press flex items-baseline justify-between gap-3 text-left">
                  <span className="min-w-0 truncate text-[14px] text-ink2">{s.plan.name}</span>
                  <span className="num shrink-0 text-[14px]">
                    <span className="font-medium">{fmtVol(s.actual, s.unit)}</span>
                    <span className="text-ink3"> von {fmtVol(s.planned, s.unit)} {s.unit} · {s.done}/{s.count}</span>
                  </span>
                </button>
              ))}
              {statuses.length === 0 && <p className="text-[14px] text-ink3">In dieser Woche liegen keine Einheiten</p>}
              {deload && (
                <p className="text-[13px] leading-5 text-ink2">
                  <Term id="Deload">Entlastungswoche</Term>: weniger Umfang, die Intensität bleibt in kleiner Dosis
                </p>
              )}
            </div>
          </Card>
          {conflicts.slice(0, 1).map((c) => (
            <Note key={c.id} tone="warn" action={<Button small onClick={() => nav('/plan')}>Vorschlag ansehen</Button>}>
              {c.text}
            </Note>
          ))}
          {openPast.length > 0 && (
            <List>
              {openPast.map((s) => (
                <SessionRow key={s.id} s={s} showDate onCheck={() => check(s)} planName={planName(s)} />
              ))}
            </List>
          )}
          {openPast.length > 0 && <p className="text-[13px] leading-5 text-ink3">Offen aus den letzten Tagen. Abhaken, verschieben oder in der Einheit auslassen</p>}
        </Section>
      )}

      {plans.filter((p) => !p.config.single).length > 0 && (
        <Section title="Wie läuft der Plan">
          {plans.filter((p) => !p.config.single).map((p) => {
            const pr = planProgress(data, p)
            return (
              <Card key={p.id} onClick={() => nav(`/plan/${p.id}`)} label={`${p.name}: ${pr.sentence}`}>
                <span className="flex items-center gap-2 text-[13px] leading-5 text-ink3">
                  <SportIcon d={p.config.sport} size={14} /> {p.name}
                </span>
                <span className="mt-1 block text-[18px] font-medium leading-6">{pr.sentence}</span>
                <span className="num mt-1 block text-[14px] leading-5 text-ink2">{pr.detail}</span>
                <span className="mt-3 flex gap-[3px]" aria-hidden>
                  {Array.from({ length: pr.weeks }, (_, i) => (
                    <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < pr.week - 1 ? 'bg-ink2' : i === pr.week - 1 ? 'bg-accent' : 'bg-line-strong')} />
                  ))}
                </span>
              </Card>
            )
          })}
          {over.flag && (
            <Note tone="warn" action={<Button small onClick={() => nav(`/plan/${plans[0].id}?anpassen=1`)}>Plan anpassen</Button>}>
              Du hast „Nicht gut erholt“ in vier Wochen {over.count}-mal genutzt. Der Plan könnte insgesamt zu hart sein
            </Note>
          )}
        </Section>
      )}

      {sports.length > 0 && (
        <Section title="Werde ich besser">
          <List>
            {sports.map((sp) => {
              const f = headline(sp, data.activities, data.profile, t)
              return (
                <button key={sp} onClick={() => nav(`/analyse?sport=${sp}`)} className="press flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                  <SportIcon d={sp} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-5 text-ink3">{SPORT_NAME[sp]}</span>
                    <span className="block text-[15px] leading-5">{f.sentence}</span>
                  </span>
                  <span className={cx('num shrink-0 rounded-[6px] border px-2 py-1 text-[12px] leading-4', f.trend === 'better' ? 'border-good text-good' : f.trend === 'worse' ? 'border-bad text-bad' : 'border-line text-ink3')}>{TREND_WORD[f.trend]}</span>
                </button>
              )
            })}
          </List>
        </Section>
      )}

      {tests.map((x) => (
        <Note key={x.id} action={<><Button small onClick={() => nav(`/plan?neu=${x.builder}&tag=${addDays(t, 2)}`)}>Test einplanen</Button><Button small kind="quiet" onClick={() => dismiss(x.id)}>Später</Button></>}>
          {x.text}
        </Note>
      ))}

      <NotRecoveredSheet session={nr} onClose={() => setNr(undefined)} />
    </Page>
  )
}
