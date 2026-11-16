import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addDays, fmtDay, fmtDuration, fmtTime, today, WEEKDAYS, weekday } from '../logic/dates'
import { exerciseById, exerciseName } from '../logic/exercises'
import { planWeeks } from '../logic/generator'
import type { Session } from '../logic/types'
import { refsFromProfile, workWeight } from '../logic/zones'
import { PRESETS } from '../presets'
import { completeSession, ctxFor, deleteSession, moveSession, reopenSession, sessionSteps, swapSessions, updateSession, useStore, weekStartOf } from '../store'
import { Button, Card, Confirm, cx, Empty, Field, List, Note, NumInput, Page, Row, Section, Sheet, Term, TextInput } from '../ui/base'
import { DISC_NAME, KIND, KindMark, sessionMeta, SportIcon, TONE_LABEL } from '../ui/marks'
import { build } from '../logic/workouts'
import { weekSessions } from '../view'
import LogSheet from './LogSheet'
import NotRecoveredSheet from './NotRecoveredSheet'

export default function SessionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const data = useStore((s) => s.data)
  const s = data.sessions.find((x) => x.id === id)
  const [sheet, setSheet] = useState<'log' | 'nr' | 'move' | 'edit' | 'replace' | 'delete' | undefined>()
  if (!s)
    return (
      <Page title="Einheit" back>
        <Empty title="Diese Einheit gibt es nicht mehr" text="Sie wurde gelöscht oder bei einer Neuberechnung ersetzt" action={<Button onClick={() => nav('/plan')}>Zur Woche</Button>} />
      </Page>
    )
  const plan = data.plans.find((p) => p.id === s.planId)
  const goal = data.goals.find((g) => g.id === plan?.goalId)
  const act = data.activities.find((a) => a.id === s.activityId)
  const steps = sessionSteps(data, s)
  const refs = refsFromProfile(data.profile, s.frozen ? s.date : today())
  const done = s.status === 'done'
  const skipped = s.status === 'skipped'
  const k = KIND[s.kind]
  const week = plan && !plan.config.single ? planWeeks(plan.config).find((w) => w.index === s.weekIndex) : undefined
  const missing: { text: string; to: string }[] = []
  if (!done) {
    const raw = s.steps.map((x) => x.text).join(' ')
    if (/\{pace:/.test(raw) && !refs.paces) missing.push({ text: 'Für ein genaues Tempo fehlt dein Lauf-Leistungsstand', to: '/profil/laufen' })
    if (/\{hrb?:/.test(raw) && !refs.hrRun) missing.push({ text: 'Für Pulsbereiche fehlt dein Maximalpuls oder Geburtsjahr', to: '/profil/puls' })
    if (/\{pw:/.test(raw) && !refs.ftp && !refs.hrBike) missing.push({ text: 'Für Wattvorgaben fehlt deine FTP, für Pulsvorgaben dein Maximalpuls', to: '/profil/rad' })
    if (/\{css:/.test(raw) && !refs.css) missing.push({ text: 'Für Schwimmtempi fehlt dein CSS-Wert', to: '/profil/schwimmen' })
  }

  return (
    <Page title={DISC_NAME[s.discipline]} sub={`${fmtDay(s.date)}${s.timeOfDay ? `, ${s.timeOfDay}` : ''}`} back>
      <Card>
        <span className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-ink3">
          <KindMark kind={s.kind} done={done} skipped={skipped} />
          <span>
            {k.label} · {TONE_LABEL[k.tone]}
          </span>
          <SportIcon d={s.discipline} size={14} />
          <span className="num">{sessionMeta(s)}</span>
        </span>
        <h2 className={cx('mt-2 text-[21px] font-medium leading-7', skipped && 'text-ink3 line-through')}>{s.title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-ink3">
          {done ? 'Erledigt' : skipped ? 'Ausgelassen' : 'Geplant'}
          {s.key ? ' · Schlüsseleinheit' : ''}
          {s.deload ? ' · Entlastungswoche' : ''}
          {s.taper ? ' · Tapering' : ''}
          {' · '}
          <Term id="Belastung" /> <span className="num">{s.load}</span>
        </p>
      </Card>

      {s.adjusted && (
        <Note>
          <span className="font-medium text-ink">Angepasst am {fmtDay(s.adjusted.at)}.</span> Grund: {s.adjusted.reason}. Ursprünglich „{s.adjusted.originalTitle}“{s.adjusted.originalDate && s.adjusted.originalDate !== s.date ? ` am ${WEEKDAYS[weekday(s.adjusted.originalDate)]}` : ''}
        </Note>
      )}
      {s.manual && !s.adjusted && <Note>Von Hand geändert. Diese Einheit bleibt bei einer Neuberechnung des Plans erhalten</Note>}
      {missing.map((m) => (
        <Note key={m.to} tone="warn" action={<Button small onClick={() => nav(m.to)}>Wert eintragen</Button>}>
          {m.text}. Bis dahin steht eine Beschreibung nach Gefühl
        </Note>
      ))}

      {!skipped && (
        <Section title={s.frozen ? 'Ablauf mit den damals gültigen Werten' : 'Ablauf'}>
          <Card className="flex flex-col gap-4">
            {steps.map((st, i) => (
              <div key={i} className="flex gap-3">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[12px] text-ink3">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-5 text-ink3">{st.part}</p>
                  <p className="leading-6">{st.text}</p>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {s.gym && !skipped && (
        <Section title="Übungen">
          <List>
            {s.gym.map((g, i) => {
              const ex = exerciseById(g.exerciseId, data.customExercises)
              const kg = workWeight(refs, g.exerciseId, g.pct1rm)
              const alts = (ex?.alt ?? []).map((a) => exerciseName(a)).join(', ')
              return (
                <div key={i} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{ex?.name ?? g.exerciseId}</span>
                    <span className="num shrink-0">
                      {g.sets} × {g.reps}
                    </span>
                  </div>
                  <p className="num text-[13px] leading-5 text-ink2">
                    {kg ? `${kg.toLocaleString('de-DE')} kg (${g.pct1rm} % von ${refs.oneRm[g.exerciseId]} kg)` : g.pct1rm ? `etwa ${g.pct1rm} % deines Maximalgewichts` : 'Gewicht nach Gefühl'}
                    {g.rir !== undefined ? ` · RIR ${g.rir}` : ''}
                    {g.restSec ? ` · Pause ${g.restSec >= 60 ? fmtTime(g.restSec) + ' min' : g.restSec + ' s'}` : ''}
                  </p>
                  {alts && <p className="text-[13px] leading-5 text-ink3">Alternativen: {alts}</p>}
                </div>
              )
            })}
          </List>
          {s.gym.some((g) => g.pct1rm && !refs.oneRm[g.exerciseId]) && !done && (
            <Note action={<Button small onClick={() => nav('/profil/kraft')}>Maximalwerte eintragen</Button>}>Mit deinen Maximalwerten rechnet die App konkrete Gewichte aus</Note>
          )}
        </Section>
      )}

      {act && (
        <Section title="Ist">
          <List>
            <Row
              title={`${fmtDuration(act.durationSec / 60)}${act.distanceM ? ` · ${act.discipline === 'swim' ? `${act.distanceM} m` : `${(act.distanceM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`}` : ''}${act.avgHr ? ` · Puls ${act.avgHr}` : ''}`}
              sub={`Soll: ${sessionMeta(s)} · ${act.source === 'manual' ? (act.note ?? 'von Hand eingetragen') : `aus ${act.source.toUpperCase()}-Datei`}`}
              onClick={() => nav(`/aktivitaet/${act.id}`)}
            />
          </List>
        </Section>
      )}

      <div className="flex flex-col gap-2">
        {!done && !skipped && (
          <>
            <div className="flex gap-2">
              <Button kind="primary" full onClick={() => completeSession(s.id)}>Erledigt wie geplant</Button>
              <Button full onClick={() => setSheet('log')}>{s.gym ? 'Sätze eintragen' : 'Mit eigenen Werten'}</Button>
            </div>
            <Button full onClick={() => setSheet('nr')}>Nicht gut erholt</Button>
          </>
        )}
        {done && (
          <div className="flex gap-2">
            {act?.source === 'manual' && <Button full onClick={() => setSheet('log')}>Werte ändern</Button>}
            <Button full onClick={() => reopenSession(s.id)}>Wieder öffnen</Button>
          </div>
        )}
        {skipped && <Button full onClick={() => updateSession(s.id, (x) => { x.status = 'planned' }, 'Einheit wieder eingeplant')}>Wieder einplanen</Button>}
        {!done && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setSheet('move')}>Verschieben</Button>
            <Button onClick={() => setSheet('edit')}>Bearbeiten</Button>
            <Button onClick={() => setSheet('replace')}>Ersetzen</Button>
            {!skipped && <Button onClick={() => updateSession(s.id, (x) => { x.status = 'skipped' }, 'Einheit ausgelassen')}>Auslassen</Button>}
          </div>
        )}
        <Button kind="quiet" onClick={() => setSheet('delete')}>Einheit löschen</Button>
      </div>

      {plan && (
        <Section title="Gehört zu">
          <List>
            {plan.templateId !== 'frei' && <Row title={plan.name} sub={week ? `Woche ${week.index + 1} von ${plan.config.weeks}${week.deload ? ' · Entlastung' : ''}` : 'Plan'} onClick={() => nav(`/plan/${plan.id}`)} left={<SportIcon d={plan.config.sport} />} />}
            {goal && <Row title={goal.title} sub={`Ziel${goal.main ? ' · Hauptziel' : ''}${goal.date ? ` · ${fmtDay(goal.date)}` : ''}`} onClick={() => nav(`/plan/${plan.id}`)} />}
          </List>
        </Section>
      )}

      <LogSheet session={sheet === 'log' ? s : undefined} onClose={() => setSheet(undefined)} />
      <NotRecoveredSheet session={sheet === 'nr' ? s : undefined} onClose={() => setSheet(undefined)} />
      <MoveSheet s={s} open={sheet === 'move'} onClose={() => setSheet(undefined)} />
      <EditSheet s={s} open={sheet === 'edit'} onClose={() => setSheet(undefined)} />
      <Sheet open={sheet === 'replace'} onClose={() => setSheet(undefined)} title="Einheit ersetzen">
        <p className="text-[14px] leading-5 text-ink2">Die neue Einheit übernimmt Tag und Plan. Die Änderung lässt sich rückgängig machen</p>
        <List>
          {PRESETS[s.discipline === 'mobility' ? 'gym' : s.discipline].concat(s.discipline !== 'mobility' ? PRESETS.mobility : []).map((p) => (
            <Row
              key={p.label}
              title={p.label}
              onClick={() => {
                const b = build(p.spec, ctxFor(data, plan?.config.level ?? 1))
                updateSession(s.id, (x) => Object.assign(x, b, { spec: p.spec, manual: true, gym: b.gym, distanceKm: b.distanceKm, elevationM: b.elevationM, heavyLegs: b.heavyLegs }), 'Einheit ersetzt')
                setSheet(undefined)
              }}
            />
          ))}
        </List>
      </Sheet>
      <Confirm open={sheet === 'delete'} onClose={() => setSheet(undefined)} title="Einheit löschen" text={`„${s.title}“ wird aus dem Plan entfernt. Das lässt sich direkt danach rückgängig machen`} confirm="Löschen" danger onConfirm={() => { deleteSession(s.id); nav(-1) }} />
    </Page>
  )
}

function MoveSheet({ s, open, onClose }: { s: Session; open: boolean; onClose: () => void }) {
  const data = useStore((x) => x.data)
  const [offset, setOffset] = useState(0)
  if (!open) return null
  const ws = addDays(weekStartOf(data, s.date), offset * 7)
  const week = weekSessions(data, ws)
  const t = today()
  return (
    <Sheet open onClose={onClose} title="Einheit verschieben">
      <div className="flex items-center justify-between">
        <Button small onClick={() => setOffset(offset - 1)}>Woche davor</Button>
        <span className="num text-[14px] text-ink2">ab {fmtDay(ws).split(', ')[1]}</span>
        <Button small onClick={() => setOffset(offset + 1)}>Woche danach</Button>
      </div>
      <List>
        {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
          const on = week.filter((x) => x.date === d && x.id !== s.id && x.status !== 'skipped')
          const prev = week.filter((x) => x.date === addDays(d, -1) && x.id !== s.id)
          const next = week.filter((x) => x.date === addDays(d, 1) && x.id !== s.id)
          const tight = (s.hard || s.kind === 'long') && [...prev, ...next].some((x) => x.hard)
          const legs = prev.some((x) => x.heavyLegs) && (s.hard || s.kind === 'long')
          const cur = d === s.date
          const hint = cur ? 'aktueller Tag' : on.length ? `dann zusammen mit „${on[0].title}“` : tight ? 'frei, aber direkt neben einer harten Einheit' : legs ? 'frei, am Tag nach schwerem Beintraining' : 'frei'
          return (
            <div key={d} className="flex min-h-14 items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className={cx('block', d < t && 'text-ink3')}>{fmtDay(d)}</span>
                <span className={cx('block truncate text-[13px] leading-5', tight || legs ? 'text-steady' : 'text-ink3')}>{hint}</span>
              </span>
              {!cur && on.length === 1 && (
                <Button small onClick={() => { swapSessions(s.id, on[0].id); onClose() }}>Tauschen</Button>
              )}
              {!cur && (
                <Button small kind="primary" onClick={() => { moveSession(s.id, d); onClose() }}>Hierhin</Button>
              )}
            </div>
          )
        })}
      </List>
    </Sheet>
  )
}

function EditSheet({ s, open, onClose }: { s: Session; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(s.title)
  const [dur, setDur] = useState<number | undefined>(s.durationMin)
  const [dist, setDist] = useState<number | undefined>(s.distanceKm)
  const [text, setText] = useState('')
  if (!open) return null
  return (
    <Sheet open onClose={onClose} title="Einheit bearbeiten">
      <Field label="Bezeichnung">
        <TextInput value={title} onChange={setTitle} />
      </Field>
      <div className="flex gap-3">
        <Field label="Dauer">
          <NumInput value={dur} onChange={setDur} unit="min" />
        </Field>
        {s.discipline !== 'gym' && s.discipline !== 'mobility' && (
          <Field label="Distanz">
            <NumInput value={dist} onChange={setDist} unit="km" decimal />
          </Field>
        )}
      </div>
      <Field label="Eigene Beschreibung, optional" hint="Ersetzt den Ablauf durch deinen Text. Leer lassen, um den Ablauf zu behalten">
        <textarea className="min-h-24 w-full rounded-[10px] border border-line bg-raised p-3 outline-none focus:border-line-strong" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button
        kind="primary"
        full
        disabled={!title.trim() || !dur}
        onClick={() => {
          updateSession(
            s.id,
            (x) => {
              const f = dur && x.durationMin ? dur / x.durationMin : 1
              x.title = title.trim()
              x.durationMin = dur ?? x.durationMin
              x.distanceKm = dist
              x.load = Math.round(x.load * f)
              if (text.trim()) {
                x.steps = [{ part: 'Hauptteil', text: text.trim() }]
                x.spec = undefined
              }
              x.manual = true
            },
            'Einheit geändert',
          )
          onClose()
        }}
      >
        Speichern
      </Button>
    </Sheet>
  )
}
