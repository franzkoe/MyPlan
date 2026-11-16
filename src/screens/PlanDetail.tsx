import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { zoneDistribution } from '../logic/analysis'
import { BASIS } from '../logic/basis'
import { addDays, fmtDate, parseTime, fmtTime, today, WEEKDAYS_SHORT } from '../logic/dates'
import { deloadWeeks, planWeeks, startForRace, VOLUME_UNIT, weekStartDate } from '../logic/generator'
import { moveDeload, proposeResume } from '../logic/plans'
import { DELOAD_WHY, SPORT_NAME, validateConfig } from '../logic/templates'
import type { Focus, Plan, PlanConfig } from '../logic/types'
import { applyRecalc, deletePlan, previewRecalc, resumePlan, saveAsTemplate, setPlanStatus, useStore, weekStartOf } from '../store'
import { Button, Card, Chips, Confirm, cx, Empty, Field, List, Note, NumInput, Page, Row, Section, Segmented, Select, Sheet, Stepper, Term, TextInput } from '../ui/base'
import { BarChart, ChartFrame, ShareBar } from '../ui/charts'
import { SportIcon, ZONE_VAR } from '../ui/marks'
import { SessionRow } from '../ui/session'
import { fmtVol, planProgress, planWeekStatus } from '../view'

export default function PlanDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const data = useStore((s) => s.data)
  const patch = useStore((s) => s.patch)
  const plan = data.plans.find((p) => p.id === id)
  const t = today()
  const [sheet, setSheet] = useState<'settings' | 'resume' | 'end' | 'delete' | 'more' | undefined>(params.get('anpassen') ? 'settings' : undefined)
  const [weekSheet, setWeekSheet] = useState<number | undefined>()
  const [openBasis, setOpenBasis] = useState<string | undefined>()
  const [sel, setSel] = useState<number | undefined>()

  if (!plan)
    return (
      <Page title="Plan" back="/plan">
        <Empty title="Diesen Plan gibt es nicht mehr" action={<Button onClick={() => nav('/plan')}>Zur Übersicht</Button>} />
      </Page>
    )
  const cfg = plan.config
  const unit = VOLUME_UNIT[cfg.sport]
  const weeks = planWeeks(cfg)
  const pr = planProgress(data, plan)
  const goal = data.goals.find((g) => g.id === plan.goalId)
  const mine = data.sessions.filter((s) => s.planId === plan.id)
  const curIdx = weeks.findIndex((w) => w.start === weekStartOf(data, t))
  const shown = sel ?? (curIdx >= 0 ? curIdx : 0)
  const archived = plan.status === 'done' || plan.status === 'ended'
  const stat = weeks.map((w) => planWeekStatus(data, plan, w.start))
  const lastEnd = addDays(weekStartDate(cfg, cfg.weeks - 1), 6)
  const zones = zoneDistribution(data.activities.filter((a) => mine.some((s) => s.activityId === a.id)), cfg.startDate, lastEnd)
  const follows = data.plans.find((p) => p.id === plan.followsPlanId)
  const finished = !archived && t > lastEnd

  return (
    <Page title={plan.name} sub={`${SPORT_NAME[cfg.sport]} · ${fmtDate(cfg.startDate)} bis ${fmtDate(lastEnd, true)}`} back="/plan">
      <Card>
        <span className="flex items-center gap-2 text-[13px] leading-5 text-ink3">
          <SportIcon d={cfg.sport} size={14} />
          {archived ? (plan.status === 'done' ? 'Abgeschlossen' : 'Vorzeitig beendet') : cfg.single ? 'Einzelne Woche' : `Woche ${pr.week} von ${pr.weeks}`}
        </span>
        <p className="mt-1 text-[20px] font-medium leading-7">{archived ? `${Math.round(pr.rate * 100)} % der Einheiten erledigt` : pr.sentence}</p>
        <p className="num mt-1 text-[14px] leading-5 text-ink2">{pr.detail}</p>
        {goal && (
          <p className="mt-3 border-t border-line pt-3 text-[14px] leading-5 text-ink2">
            Ziel: <span className="text-ink">{goal.title}</span>
            {goal.date ? ` am ${fmtDate(goal.date, true)}` : ''}
            {goal.main ? ' · Hauptziel' : ''}
            {!goal.main && !archived && (
              <button className="ml-2 underline decoration-line-strong underline-offset-4" onClick={() => patch((d) => d.goals.forEach((g) => (g.main = g.id === goal.id)))}>
                Zum Hauptziel machen
              </button>
            )}
          </p>
        )}
        {follows && (
          <p className="mt-2 text-[13px] leading-5 text-ink3">
            Folgeplan von{' '}
            <button className="underline decoration-line-strong underline-offset-4" onClick={() => nav(`/plan/${follows.id}`)}>
              {follows.name}
            </button>
          </p>
        )}
      </Card>

      {plan.status === 'paused' && (
        <Note tone="warn" action={<Button small kind="primary" onClick={() => setSheet('resume')}>Fortsetzen</Button>}>
          Pausiert seit {plan.pausedAt ? fmtDate(plan.pausedAt) : 'kurzem'}. Die Einheiten sind in Kalender und Startseite ausgeblendet
        </Note>
      )}
      {finished && (
        <Note tone="good" action={<><Button small kind="primary" onClick={() => setPlanStatus(plan.id, 'done')}>Abschließen</Button><Button small onClick={() => nav(`/plan/neu?von=${plan.id}&modus=folge`)}>Folgeplan anlegen</Button></>}>
          Die letzte Woche ist vorbei. Schließe den Plan ab, dann liegt er mit allen Einheiten im Archiv
        </Note>
      )}

      {!archived && (
        <div className="grid grid-cols-2 gap-2">
          {!cfg.single && <Button onClick={() => setSheet('settings')}>Einstellungen</Button>}
          {plan.status === 'active' ? <Button onClick={() => setPlanStatus(plan.id, 'paused')}>Pausieren</Button> : <Button onClick={() => setSheet('resume')}>Fortsetzen</Button>}
          <Button onClick={() => setSheet('more')}>Weitere Aktionen</Button>
          {!cfg.single && <Button onClick={() => nav(`/plan/neu?von=${plan.id}&modus=folge`)}>Folgeplan</Button>}
        </div>
      )}
      {archived && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => nav(`/plan/neu?von=${plan.id}&modus=folge`)}>Folgeplan</Button>
          <Button onClick={() => nav(`/plan/neu?von=${plan.id}&modus=kopie`)}>Kopieren</Button>
          <Button onClick={() => saveAsTemplate(plan.id, plan.name)}>Als Vorlage speichern</Button>
          <Button kind="danger" onClick={() => setSheet('delete')}>Löschen</Button>
        </div>
      )}

      {!cfg.single && (
        <Section title="Wochenumfang">
          <Card>
            <ChartFrame
              yLabel={`${unit} pro Woche`}
              legend={[{ label: 'Ist', color: 'var(--ink2)' }, { label: 'Soll', color: 'var(--ink2)', hollow: true }]}
              note="Gefüllt ist, was du trainiert hast, der Umriss das Soll. E steht für Entlastung, T für Tapering. Balken antippen zeigt die Woche"
            >
              <BarChart
                bars={weeks.map((w, i) => ({ label: String(i + 1), plan: stat[i]?.planned ?? w.volume, actual: w.start <= t ? (stat[i]?.actual ?? 0) : undefined, hollow: w.deload || w.taper, mark: w.deload ? 'E' : w.taper ? 'T' : undefined, highlight: i === shown }))}
                fmtY={(v) => fmtVol(v, unit)}
                onSelect={setSel}
              />
            </ChartFrame>
          </Card>
        </Section>
      )}

      <Section
        title={cfg.single ? 'Einheiten' : `Woche ${shown + 1} · ab ${fmtDate(weeks[shown].start)}${weeks[shown].deload ? ' · Entlastung' : weeks[shown].taper ? ' · Tapering' : ''}`}
        action={!cfg.single && !archived && weeks[shown].start > weekStartOf(data, t) ? <button className="press h-8 text-[13px] text-ink2 underline decoration-line-strong underline-offset-4" onClick={() => setWeekSheet(shown)}>Woche tauschen</button> : undefined}
      >
        {(() => {
          const list = mine.filter((s) => (cfg.single ? true : s.date >= weeks[shown].start && s.date <= addDays(weeks[shown].start, 6))).sort((a, b) => a.date.localeCompare(b.date))
          return list.length ? (
            <List>
              {list.map((s) => (
                <SessionRow key={s.id} s={s} showDate />
              ))}
            </List>
          ) : (
            <p className="px-1 text-[14px] text-ink3">In dieser Woche liegen keine Einheiten</p>
          )
        })()}
        {stat[shown] && (
          <p className="num px-1 text-[13px] leading-5 text-ink3">
            Soll {fmtVol(stat[shown]!.planned, unit)} {unit} · Ist {fmtVol(stat[shown]!.actual, unit)} {unit} · {stat[shown]!.done} von {stat[shown]!.count} erledigt
          </p>
        )}
      </Section>

      {zones && cfg.sport !== 'gym' && (
        <Section title="Zeit in den Pulszonen">
          <Card className="flex flex-col gap-3">
            <p>{zones.sentence}</p>
            <ShareBar parts={zones.share.map((v, i) => ({ label: `Zone ${i + 1}`, value: v, color: ZONE_VAR[i + 1] }))} />
            <p className="text-[13px] leading-5 text-ink3">
              Aus {zones.count} Aufzeichnungen mit Pulsmessung. Vorgabe: etwa 80 % in <Term id="Zonen">Zone</Term> 1 und 2
            </p>
          </Card>
        </Section>
      )}

      {plan.basis.length > 0 && (
        <Section title="Worauf beruht dieser Plan">
          <List>
            {plan.basis.filter((b) => BASIS[b]).map((b) => {
              const x = BASIS[b]
              const open = openBasis === b
              return (
                <div key={b}>
                  <button aria-expanded={open} className="press flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left" onClick={() => setOpenBasis(open ? undefined : b)}>
                    <span>{x.title}</span>
                    <span className="text-[13px] text-ink3">{open ? 'Schließen' : 'Lesen'}</span>
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 px-4 pb-4 text-[14px] leading-5 text-ink2">
                      <p>{x.text}</p>
                      {x.caveat && (
                        <p>
                          <span className="font-medium text-ink">Grenzen: </span>
                          {x.caveat}
                        </p>
                      )}
                      <p className="text-[13px] text-ink3">Quellen: {x.sources.join('; ')}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </List>
        </Section>
      )}

      <SettingsSheet plan={plan} open={sheet === 'settings'} onClose={() => setSheet(undefined)} />
      <ResumeSheet plan={plan} open={sheet === 'resume'} onClose={() => setSheet(undefined)} />
      <WeekSheet plan={plan} index={weekSheet} onClose={() => setWeekSheet(undefined)} />
      <Sheet open={sheet === 'more'} onClose={() => setSheet(undefined)} title="Weitere Aktionen">
        <List>
          <Row title="Als Grundlage kopieren" sub="Neuer Plan mit denselben Einstellungen" onClick={() => nav(`/plan/neu?von=${plan.id}&modus=kopie`)} />
          <Row title="Als eigene Vorlage speichern" sub="Erscheint unter den Vorlagen dieser Sportart" onClick={() => { saveAsTemplate(plan.id, plan.name); setSheet(undefined) }} />
          <Row title="Vorzeitig beenden" sub="Offene Einheiten entfallen, Erledigtes bleibt im Archiv" onClick={() => setSheet('end')} />
          <Row title="Plan löschen" sub="Entfernt den Plan mit allen Einheiten" onClick={() => setSheet('delete')} />
        </List>
      </Sheet>
      <Confirm open={sheet === 'end'} onClose={() => setSheet(undefined)} title="Plan vorzeitig beenden" text="Alle noch offenen Einheiten entfallen. Erledigte Einheiten und Auswertungen bleiben im Archiv. Das lässt sich direkt danach rückgängig machen" confirm="Beenden" onConfirm={() => setPlanStatus(plan.id, 'ended')} />
      <Confirm open={sheet === 'delete'} onClose={() => setSheet(undefined)} title="Plan löschen" text={`„${plan.name}“ wird mit allen Einheiten gelöscht. Importierte Aufzeichnungen bleiben erhalten. Das lässt sich direkt danach rückgängig machen`} confirm="Löschen" danger onConfirm={() => { deletePlan(plan.id); nav('/plan') }} />
    </Page>
  )
}

const FOCUS_OPTS: { value: Focus; label: string }[] = [
  { value: 'mixed', label: 'Gemischt' },
  { value: 'base', label: 'Nur Grundlage' },
  { value: 'intervals', label: 'Nur Intervalle (VO2max)' },
  { value: 'threshold', label: 'Nur Schwelle' },
  { value: 'tempo', label: 'Tempo / Wettkampftempo' },
  { value: 'hills', label: 'Berg' },
  { value: 'long', label: 'Lange Einheit betont' },
]
const FOCUS_GYM: { value: Focus; label: string }[] = [
  { value: 'mixed', label: 'Gemischt' },
  { value: 'maxStrength', label: 'Maximalkraft' },
  { value: 'hypertrophy', label: 'Hypertrophie' },
  { value: 'strengthEndurance', label: 'Kraftausdauer' },
  { value: 'power', label: 'Schnellkraft' },
  { value: 'stability', label: 'Stabilität und Mobilität' },
]

function SettingsSheet({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const [cfg, setCfg] = useState<PlanConfig>(plan.config)
  const [release, setRelease] = useState(false)
  const [time, setTime] = useState(plan.config.targetTimeSec ? fmtTime(plan.config.targetTimeSec) : '')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setCfg(plan.config)
      setRelease(false)
      setTried(false)
    }
  }, [open])
  const preview = useMemo(() => (open ? previewRecalc(data, plan.id, cfg, release) : undefined), [open, cfg, release])
  if (!open) return null
  const set = (p: Partial<PlanConfig>) => setCfg((c) => ({ ...c, ...p }))
  const unit = VOLUME_UNIT[cfg.sport]
  const issues = validateConfig(cfg, today())
  const errors = issues.filter((i) => i.level === 'error')
  const ws = data.profile.weekStart
  const manualCount = data.sessions.filter((s) => s.planId === plan.id && s.status === 'planned' && (s.manual || s.adjusted) && preview && s.date >= preview.from).length
  return (
    <Sheet open onClose={onClose} title="Plan anpassen">
      <p className="text-[14px] leading-5 text-ink2">Neu berechnet werden nur die noch offenen Wochen ab der nächsten. Erledigte Einheiten und die laufende Woche bleiben, wie sie sind</p>
      <div className="flex gap-3">
        <Field label="Dauer in Wochen" hint="Verlängern oder verkürzen">
          <Stepper value={cfg.weeks} min={1} max={52} onChange={(v) => set({ weeks: v, startDate: cfg.raceDate && !cfg.gaps?.length ? cfg.startDate : cfg.startDate })} />
        </Field>
        <Field label="Einheiten pro Woche">
          <Stepper value={cfg.sessionsPerWeek} min={1} max={cfg.sport === 'tri' ? 9 : 7} onChange={(v) => set({ sessionsPerWeek: v })} />
        </Field>
      </div>
      <Field label="Trainingstage">
        <Chips values={cfg.days} onToggle={(d) => set({ days: cfg.days.includes(d) ? cfg.days.filter((x) => x !== d) : [...cfg.days, d].sort() })} options={Array.from({ length: 7 }, (_, i) => (i + ws) % 7).map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} />
      </Field>
      <div className="flex gap-3">
        <Field label="Startumfang">
          <NumInput value={cfg.startVolume} onChange={(v) => set({ startVolume: v ?? 0 })} unit={unit} decimal />
        </Field>
        <Field label="Steigerung pro Woche">
          <Stepper value={cfg.rampPct} min={0} max={20} step={0.5} format={(v) => `${v.toLocaleString('de-DE')} %`} onChange={(v) => set({ rampPct: v })} />
        </Field>
      </div>
      <Field label="Ausrichtung">
        <Select value={cfg.focus} onChange={(v: Focus) => set({ focus: v })} options={cfg.sport === 'gym' ? FOCUS_GYM : FOCUS_OPTS} />
      </Field>
      <Field label="Entlastungswochen" hint={tried ? DELOAD_WHY : undefined}>
        <Segmented
          value={String(cfg.deloadEvery)}
          onChange={(v) => {
            if (v === 'aus') setTried(true)
            else {
              setTried(false)
              set({ deloadEvery: Number(v) as 3 | 4, deloadWeeks: undefined, deloadMoves: undefined })
            }
          }}
          options={[{ value: '4', label: 'Jede vierte' }, { value: '3', label: 'Jede dritte' }, { value: 'aus', label: 'Keine' }]}
        />
      </Field>
      {cfg.raceDate && (
        <div className="flex gap-3">
          <Field label="Zieldatum">
            <TextInput type="date" value={cfg.raceDate} onChange={(v) => v && set({ raceDate: v, startDate: startForRace(v, cfg.weeks, ws), gaps: undefined })} />
          </Field>
          {(cfg.sport === 'run' || cfg.sport === 'tri') && (
            <Field label="Zielzeit">
              <TextInput value={time} placeholder="h:mm:ss" onChange={(v) => { setTime(v); set({ targetTimeSec: v.includes(':') ? parseTime(v) : undefined }) }} />
            </Field>
          )}
        </div>
      )}
      {issues.map((i, k) => (
        <Note key={k} tone={i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info'} action={i.fix && <Button small onClick={() => set(i.fix!.patch)}>{i.fix.label}</Button>}>
          {i.text}
        </Note>
      ))}
      {preview && (
        <Section title="Das ändert sich">
          {preview.changes.length === 0 ? (
            <p className="text-[14px] text-ink3">Keine Änderung an den offenen Wochen</p>
          ) : (
            <List>
              {preview.changes.slice(0, 8).map((c) => (
                <div key={c.week} className="num flex items-baseline justify-between gap-3 px-4 py-2 text-[14px]">
                  <span className="text-ink2">
                    Woche {c.week + 1} ab {fmtDate(c.start)}
                  </span>
                  <span>
                    {fmtVol(c.before, unit)} → {fmtVol(c.after, unit)} {unit} · {c.countBefore} → {c.countAfter}
                  </span>
                </div>
              ))}
              {preview.changes.length > 8 && <div className="px-4 py-2 text-[13px] text-ink3">und {preview.changes.length - 8} weitere Wochen</div>}
            </List>
          )}
          {manualCount > 0 && (
            <button role="checkbox" aria-checked={release} onClick={() => setRelease(!release)} className="press flex min-h-11 items-center gap-3 text-left">
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border', release ? 'border-ink bg-primary text-on-primary' : 'border-line-strong')}>{release ? '✓' : ''}</span>
              <span className="text-[14px] leading-5">
                {manualCount} von Hand geänderte {manualCount === 1 ? 'Einheit' : 'Einheiten'} ebenfalls neu berechnen. Sonst bleiben sie erhalten
              </span>
            </button>
          )}
        </Section>
      )}
      <div className="flex gap-2">
        <Button full onClick={onClose}>Abbrechen</Button>
        <Button full kind="primary" disabled={errors.length > 0 || !preview || preview.changes.length === 0} onClick={() => { applyRecalc(plan.id, cfg, release); onClose() }}>
          Übernehmen
        </Button>
      </div>
    </Sheet>
  )
}

function ResumeSheet({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  if (!open) return null
  const r = proposeResume(plan, today(), data.profile.weekStart)
  return (
    <Sheet open onClose={onClose} title="Plan fortsetzen">
      <p>{r.text}.</p>
      <Note>Grund: Nach einer Pause sind Sehnen und Muskeln die Belastung nicht mehr gewohnt, auch wenn sich die Ausdauer noch gut anfühlt. Ein reduzierter Einstieg senkt das Risiko für Überlastung</Note>
      <div className="flex flex-col gap-2">
        <Button kind="primary" full onClick={() => { resumePlan(plan.id, r.cfg); onClose() }}>
          Mit angepasstem Wiedereinstieg fortsetzen
        </Button>
        <Button full onClick={() => { resumePlan(plan.id, plan.config); onClose() }}>
          Ohne Anpassung fortsetzen
        </Button>
        {r.restart && <Button full onClick={() => nav(`/plan/neu?von=${plan.id}&modus=folge`)}>Neuen Plan mit niedrigerem Start anlegen</Button>}
      </div>
    </Sheet>
  )
}

function WeekSheet({ plan, index, onClose }: { plan: Plan; index?: number; onClose: () => void }) {
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    setError(undefined)
  }, [index])
  if (index === undefined) return null
  const cfg = plan.config
  const w = planWeeks(cfg)[index]
  const deloads = deloadWeeks(cfg)
  const nearest = deloads.length ? deloads.reduce((a, b) => (Math.abs(b - index) < Math.abs(a - index) ? b : a)) : undefined
  const override = (focus?: Focus) => {
    const o = { ...(cfg.weekOverrides ?? {}) }
    if (focus) o[index] = { ...o[index], focus }
    else delete o[index]
    applyRecalc(plan.id, { ...cfg, weekOverrides: o }, false, 'Woche getauscht')
    onClose()
  }
  const opts: { label: string; sub: string; focus?: Focus }[] =
    cfg.sport === 'gym'
      ? [
          { label: 'Wie im Plan vorgesehen', sub: 'Hebt einen früheren Tausch auf' },
          { label: 'Maximalkraft-Woche', sub: 'Schwer, wenige Wiederholungen', focus: 'maxStrength' },
          { label: 'Hypertrophie-Woche', sub: 'Mittlere Last, mehr Volumen', focus: 'hypertrophy' },
          { label: 'Kraftausdauer-Woche', sub: 'Leicht, viele Wiederholungen', focus: 'strengthEndurance' },
          { label: 'Stabilität und Mobilität', sub: 'Rumpf, einbeinige Übungen, Beweglichkeit', focus: 'stability' },
        ]
      : [
          { label: 'Wie im Plan vorgesehen', sub: 'Hebt einen früheren Tausch auf' },
          { label: 'Grundlagenwoche', sub: 'Nur lockere Einheiten, gleicher Umfang', focus: 'base' },
          { label: 'Intervallwoche', sub: 'Harte Einheiten als VO2max-Intervalle', focus: 'intervals' },
          { label: 'Schwellenwoche', sub: 'Harte Einheiten an der Schwelle', focus: 'threshold' },
          { label: 'Bergwoche', sub: 'Bergläufe bzw. Kraftausdauer am Berg', focus: 'hills' },
        ]
  return (
    <Sheet open onClose={onClose} title={`Woche ${index + 1} tauschen`}>
      <p className="text-[14px] leading-5 text-ink2">Die Woche ab {fmtDate(w.start)} wird durch eine andere Wochenart ersetzt. Der Umfang bleibt, von Hand geänderte Einheiten auch</p>
      <List>
        {opts.map((o) => (
          <Row key={o.label} title={o.label} sub={o.sub} onClick={() => override(o.focus)} />
        ))}
        {!w.deload && !w.taper && nearest !== undefined && (
          <Row
            title="Entlastungswoche hierher verschieben"
            sub={`Die Entlastung aus Woche ${nearest + 1} rückt in diese Woche`}
            onClick={() => {
              const r = moveDeload(cfg, nearest, index)
              if (r.error || !r.cfg) setError(r.error)
              else {
                applyRecalc(plan.id, r.cfg, false, 'Entlastungswoche verschoben')
                onClose()
              }
            }}
          />
        )}
      </List>
      {error && <Note tone="bad">{error}. {DELOAD_WHY}</Note>}
    </Sheet>
  )
}
