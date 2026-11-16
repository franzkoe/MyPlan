import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, fmtDate, today, WEEKDAYS } from '../logic/dates'
import { planWeeks } from '../logic/generator'
import { evaluateRecovery, recoverySuggestions, type WeekSuggestion } from '../logic/recovery'
import { checkValue } from '../logic/templates'
import { build, easeSpec } from '../logic/workouts'
import { applyRecalc, ctxFor, dismiss, moveSession, pullDeloadForward, saveRecovery, updateSession, useStore, weekStartOf } from '../store'
import { Button, Card, cx, Field, List, Note, NumInput, Page, Row, Section, Term } from '../ui/base'
import { ChartFrame, dateLabels, dateX, LineChart } from '../ui/charts'
import { weekSessions } from '../view'

const STATUS_TONE = { collecting: 'info', good: 'good', normal: 'good', watch: 'warn', low: 'bad' } as const

function Scale({ value, onChange, lo, hi }: { value?: number; onChange: (v?: number) => void; lo: string; hi: string }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-pressed={value === n} onClick={() => onChange(value === n ? undefined : n)} className={cx('press num h-11 rounded-[8px] border', value === n ? 'border-ink bg-primary text-on-primary' : 'border-line bg-raised text-ink2')}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] leading-4 text-ink3">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  )
}

export default function Recovery() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const t = today()
  const ws = weekStartOf(data, t)
  const cur = data.recovery.find((e) => e.week === ws)
  const [hrv, setHrv] = useState(cur?.hrv)
  const [rhr, setRhr] = useState(cur?.rhr)
  const [sleep, setSleep] = useState(cur?.sleepH)
  const [feeling, setFeeling] = useState(cur?.feeling)
  const [sore, setSore] = useState(cur?.soreness)
  useEffect(() => {
    setHrv(cur?.hrv)
    setRhr(cur?.rhr)
    setSleep(cur?.sleepH)
    setFeeling(cur?.feeling)
    setSore(cur?.soreness)
  }, [cur?.hrv, cur?.rhr, cur?.sleepH, cur?.feeling, cur?.soreness])

  const ev = evaluateRecovery(data.recovery, ws)
  const nextWs = addDays(ws, 7)
  const nextWeek = weekSessions(data, nextWs)
  const active = data.plans.filter((p) => p.status === 'active' && !p.config.single)
  const nextDeloadIn = active
    .map((p) => {
      const weeks = planWeeks(p.config)
      const i = weeks.findIndex((w) => w.start === nextWs)
      const d = weeks.find((w) => w.deload && w.start > nextWs)
      return i >= 0 && d ? d.index - i : undefined
    })
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b)[0]
  const sugs = recoverySuggestions(ev, nextWeek, nextWs, t, nextDeloadIn).filter((s) => !data.dismissed.includes(s.id))
  const errs = [checkValue('hrv', hrv), checkValue('hrRest', rhr), checkValue('sleep', sleep)].filter((x): x is string => !!x)
  const dirty = hrv !== cur?.hrv || rhr !== cur?.rhr || sleep !== cur?.sleepH || feeling !== cur?.feeling || sore !== cur?.soreness
  const hist = [...data.recovery].sort((a, b) => a.week.localeCompare(b.week))
  const hrvPts = hist.filter((e) => e.hrv).slice(-16)
  const rhrPts = hist.filter((e) => e.rhr).slice(-16)
  const r = data.profile.reminder

  const apply = (s: WeekSuggestion) => {
    if (s.type === 'move' && s.sessionId && s.moveTo) moveSession(s.sessionId, s.moveTo)
    else if (s.type === 'ease' && s.sessionId) {
      const x = data.sessions.find((y) => y.id === s.sessionId)
      const plan = data.plans.find((p) => p.id === x?.planId)
      if (x?.spec) {
        const spec = easeSpec(x.spec)
        const b = build(spec, ctxFor(data, plan?.config.level ?? 1))
        updateSession(x.id, (y) => Object.assign(y, b, { spec, gym: b.gym, distanceKm: b.distanceKm, elevationM: b.elevationM, heavyLegs: b.heavyLegs, adjusted: { type: 'eased', reason: 'HRV gedrückt und Ruhepuls erhöht', at: t, originalTitle: x.title, originalDate: x.date } }), 'Einheit abgeschwächt')
      }
    } else if (s.type === 'deload') {
      for (const p of active) {
        const cfg = pullDeloadForward(useStore.getState().data, p.id, nextWs)
        if (cfg) applyRecalc(p.id, cfg, false, 'Entlastungswoche vorgezogen')
      }
    }
    dismiss(s.id)
  }

  return (
    <Page title="Erholung">
      <Card>
        <span className="flex items-center gap-2 text-[13px] leading-5 text-ink3">
          <span className={cx('h-2 w-2 rounded-full', { info: 'bg-ink3', good: 'bg-good', warn: 'bg-steady', bad: 'bg-bad' }[STATUS_TONE[ev.status]])} />
          Diese Woche im Vergleich zu deinem Normalbereich
        </span>
        <p className="mt-1 text-[20px] font-medium leading-7">{ev.headline}</p>
        <p className="mt-1 text-[14px] leading-5 text-ink2">{ev.detail}</p>
        {ev.status === 'collecting' && ev.weeksNeeded > 0 && (
          <span className="mt-3 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < ev.weeksCollected ? 'bg-ink2' : 'bg-line-strong')} />
            ))}
          </span>
        )}
      </Card>

      {sugs.length > 0 && (
        <Section title="Vorschläge für die kommende Woche">
          {sugs.map((s) => (
            <Note key={s.id} tone="warn" action={<><Button small kind="primary" onClick={() => apply(s)}>Übernehmen</Button><Button small kind="quiet" onClick={() => dismiss(s.id)}>Plan lassen</Button></>}>
              <span className="font-medium text-ink">{s.text}.</span> {s.reason}
            </Note>
          ))}
          <p className="px-1 text-[13px] leading-5 text-ink3">Die App ändert nichts von selbst. Ohne deine Auswahl bleibt der Plan, wie er ist</p>
        </Section>
      )}

      <Section title={`Woche ab ${fmtDate(ws)} eintragen`}>
        <Card className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Field label={<Term id="HRV" />} hint="RMSSD, Wochenmittel">
              <NumInput value={hrv} onChange={setHrv} unit="ms" decimal />
            </Field>
            <Field label="Ruhepuls" hint="Wochenmittel">
              <NumInput value={rhr} onChange={setRhr} unit="Schläge" decimal />
            </Field>
          </div>
          <Field label="Schlafdauer pro Nacht">
            <NumInput value={sleep} onChange={setSleep} unit="Stunden" decimal />
          </Field>
          <Field label="Befinden, optional">
            <Scale value={feeling} onChange={setFeeling} lo="schlecht" hi="sehr gut" />
          </Field>
          <Field label="Muskelkater, optional">
            <Scale value={sore} onChange={setSore} lo="keiner" hi="stark" />
          </Field>
          {errs.map((e) => (
            <Note key={e} tone="bad">{e}</Note>
          ))}
          <Button kind="primary" full disabled={!dirty || errs.length > 0 || (hrv === undefined && rhr === undefined && sleep === undefined)} onClick={() => saveRecovery({ week: ws, hrv, rhr, sleepH: sleep, feeling, soreness: sore, source: 'user', days: cur?.days })}>
            Speichern
          </Button>
          <Button full onClick={() => nav('/import')}>Aus Whoop- oder Garmin-CSV einlesen</Button>
        </Card>
      </Section>

      {hrvPts.length > 1 && (
        <Section title="HRV-Verlauf">
          <Card>
            <ChartFrame yLabel="RMSSD in ms, Wochenmittel" legend={ev.hrv ? [{ label: 'dein Normalbereich', color: 'var(--line-strong)' }] : undefined} note={ev.hrv ? `Das graue Band ist dein Normalbereich aus den letzten ${ev.hrv.n} Wochen. Werte darunter sprechen für unvollständige Erholung` : 'Sobald vier Wochen vorliegen, zeigt ein Band deinen Normalbereich'}>
              <LineChart series={[{ points: hrvPts.map((e) => ({ x: dateX(e.week), y: e.hrv! })), color: 'var(--accent)', dots: true }]} xLabels={dateLabels(hrvPts.map((e) => e.week))} band={ev.hrv ? { lo: ev.hrv.lo, hi: ev.hrv.hi } : undefined} />
            </ChartFrame>
          </Card>
        </Section>
      )}
      {rhrPts.length > 1 && (
        <Section title="Ruhepuls-Verlauf">
          <Card>
            <ChartFrame yLabel="Schläge pro Minute, Wochenmittel" note={ev.rhr ? 'Das graue Band ist dein Normalbereich. Werte darüber sprechen für unvollständige Erholung' : 'Wochenmittel deines Ruhepulses'}>
              <LineChart series={[{ points: rhrPts.map((e) => ({ x: dateX(e.week), y: e.rhr! })), color: 'var(--ink2)', dots: true }]} xLabels={dateLabels(rhrPts.map((e) => e.week))} band={ev.rhr ? { lo: ev.rhr.lo, hi: ev.rhr.hi } : undefined} />
            </ChartFrame>
          </Card>
        </Section>
      )}

      {hist.length > 0 && (
        <Section title="Bisherige Wochen">
          <List>
            {[...hist].reverse().slice(0, 8).map((e) => (
              <Row key={e.week} title={`Woche ab ${fmtDate(e.week)}`} sub={e.source === 'csv' ? 'aus CSV' : 'von Hand'} right={<span className="num text-[14px] text-ink2">{e.hrv ? `${Math.round(e.hrv)} ms` : 'ohne HRV'} · {e.rhr ? `Puls ${Math.round(e.rhr)}` : 'ohne Puls'}{e.sleepH ? ` · ${e.sleepH.toLocaleString('de-DE')} h` : ''}</span>} />
            ))}
          </List>
        </Section>
      )}

      <Section title="Erinnerung">
        <List>
          <Row title={r.enabled ? `${WEEKDAYS[r.weekday]}s um ${r.time} Uhr` : 'Ausgeschaltet'} sub="Wöchentliche Benachrichtigung auf dem Handy" onClick={() => nav('/profil/erinnerung')} />
        </List>
        <p className="px-1 text-[13px] leading-5 text-ink3">Die Auswertung ist ein Hinweis zur Trainingssteuerung und keine medizinische Aussage. Bleib für die Messung bei einem Gerät, die Werte verschiedener Geräte sind nicht vergleichbar</p>
      </Section>
    </Page>
  )
}
