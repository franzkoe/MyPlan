import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, fmtDate, fmtTime, parseTime, startOfWeek, today, WEEKDAYS_SHORT, weekday } from '../logic/dates'
import { generatePlan, planWeeks, startForRace, taperWeeks, VOLUME_UNIT, weekStartDate } from '../logic/generator'
import { alignWithPlans, experience } from '../logic/plans'
import { defaultDays, DELOAD_WHY, goalDef, GOALS, LEVEL_NAME, SPORT_NAME, templateConfig, validateConfig, WEEK_TEMPLATES, weekTemplateConfig } from '../logic/templates'
import type { Focus, GymSplit, Level, PlanConfig, Sport, Terrain } from '../logic/types'
import { cssPace, runFitness } from '../logic/zones'
import { addSession, createPlan, ctxFor, updateProfile, useStore, weekStartOf } from '../store'
import { Button, Card, Chips, Field, List, Note, NumInput, Page, Section, Segmented, Select, Stepper, Term, TextInput } from '../ui/base'
import { BarChart, ChartFrame } from '../ui/charts'
import { SessionRow } from '../ui/session'
import { fmtVol } from '../view'

type Mode = 'template' | 'custom' | 'week'
const SPORTS: Sport[] = ['run', 'bike', 'swim', 'tri', 'gym']
const FOCUS_ENDURANCE: { value: Focus; label: string }[] = [
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
  { value: 'maxStrength', label: 'Maximalkraft (schwer, wenige Wiederholungen)' },
  { value: 'hypertrophy', label: 'Hypertrophie (mittlere Last, mehr Volumen)' },
  { value: 'strengthEndurance', label: 'Kraftausdauer (leicht, viele Wiederholungen)' },
  { value: 'power', label: 'Schnellkraft' },
  { value: 'stability', label: 'Stabilität und Mobilität' },
]
const RACE_DIST = [
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 21097.5, label: 'Halbmarathon' },
  { value: 42195, label: 'Marathon' },
]

export default function PlanWizard() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const t = today()
  const wsNum = data.profile.weekStart
  const fromPlan = data.plans.find((p) => p.id === params.get('von'))
  const fromMode = params.get('modus') ?? 'folge'
  const exp = useMemo(() => (fromPlan ? experience(fromPlan, data.sessions, data.activities, t) : undefined), [fromPlan?.id])
  const nextMonday = weekStartOf(data, t) === t ? t : addDays(weekStartOf(data, t), 7)

  const initial = (): PlanConfig => {
    if (fromPlan) {
      const c = fromPlan.config
      const end = addDays(weekStartDate(c, c.weeks - 1), 7)
      const start = fromMode === 'folge' && end > t ? end : nextMonday
      return {
        ...c,
        startDate: start,
        raceDate: undefined,
        gaps: undefined,
        weekFactors: undefined,
        weekOverrides: undefined,
        deloadWeeks: undefined,
        deloadMoves: undefined,
        avoidHardDays: undefined,
        startVolume: fromMode === 'folge' && exp ? exp.suggestion.startVolume : c.startVolume,
        rampPct: fromMode === 'folge' && exp ? exp.suggestion.rampPct : c.rampPct,
      }
    }
    const sport = (data.profile.sports[0] ?? 'run') as Sport
    return templateConfig(sport, GOALS[sport][0].id, 1, { startDate: nextMonday, weekStart: wsNum })
  }

  const [step, setStep] = useState(fromPlan ? 2 : 1)
  const [mode, setMode] = useState<Mode>(fromPlan ? 'custom' : 'template')
  const [cfg, setCfg] = useState<PlanConfig>(initial)
  const [dateMode, setDateMode] = useState<'start' | 'race'>('start')
  const [daysTouched, setDaysTouched] = useState(!!fromPlan)
  const [name, setName] = useState<string | undefined>(fromPlan ? (fromMode === 'folge' ? `${fromPlan.name}, Folgeplan` : `${fromPlan.name}, Kopie`) : undefined)
  const [timeText, setTimeText] = useState('')
  const [weekTpl, setWeekTpl] = useState(WEEK_TEMPLATES[0].id)
  const [weekDate, setWeekDate] = useState(nextMonday)
  const [sel, setSel] = useState<number | undefined>()
  const [main, setMain] = useState(false)
  const [addTest, setAddTest] = useState(false)
  const [race, setRace] = useState<{ dist: number; time: string }>({ dist: 10000, time: '' })
  const [ftp, setFtp] = useState<number | undefined>()
  const [swim, setSwim] = useState<{ t400: string; t200: string }>({ t400: '', t200: '' })

  const set = (p: Partial<PlanConfig>) => setCfg((c) => ({ ...c, ...p }))
  const applyTemplate = (sport: Sport, goal: string, level: Level, keep: Partial<PlanConfig> = {}) => {
    const base = templateConfig(sport, goal, level, { startDate: cfg.startDate, raceDate: dateMode === 'race' ? cfg.raceDate : undefined, weekStart: wsNum, terrain: sport === cfg.sport ? cfg.terrain : 'flat', targetTimeSec: cfg.targetTimeSec, distanceKm: goal === 'ultra' ? (cfg.distanceKm ?? 70) : undefined })
    setCfg({ ...base, ...keep })
    setDaysTouched(false)
    setSel(undefined)
  }

  const others = data.plans.filter((p) => p.status === 'active' && !p.config.single).map((plan) => ({ plan, sessions: data.sessions.filter((s) => s.planId === plan.id) }))
  const def = goalDef(cfg.sport, cfg.goal)
  const unit = VOLUME_UNIT[cfg.sport]

  const weekCfg = useMemo(() => {
    const tpl = WEEK_TEMPLATES.find((w) => w.id === weekTpl) ?? WEEK_TEMPLATES[0]
    return { tpl, cfg: weekTemplateConfig(tpl, cfg.level, startOfWeek(weekDate, wsNum)) }
  }, [weekTpl, weekDate, cfg.level])

  const finalCfg = useMemo(() => (mode === 'week' ? weekCfg.cfg : alignWithPlans(cfg, others, daysTouched)), [cfg, mode, weekCfg, daysTouched, others.length])
  const sessions = useMemo(() => {
    try {
      return generatePlan('vorschau', finalCfg, ctxFor(data, finalCfg.level), wsNum)
    } catch {
      return []
    }
  }, [finalCfg])
  const weeks = useMemo(() => planWeeks(finalCfg), [finalCfg])
  const issues = mode === 'week' ? [] : validateConfig(finalCfg, t)
  const errors = issues.filter((i) => i.level === 'error')
  const shown = sel ?? Math.min(weeks.length - 1, weeks.findIndex((w) => !w.deload && w.index >= Math.min(1, weeks.length - 1)))
  const taper = taperWeeks(finalCfg)
  const aligned = mode !== 'week' && others.length > 0
  const autoName = mode === 'week' ? weekCfg.tpl.name : `${SPORT_NAME[cfg.sport]} ${def.name}${mode === 'custom' ? ', eigener Plan' : `, ${LEVEL_NAME[cfg.level]}`}`

  const needsRun = (cfg.sport === 'run' || cfg.sport === 'tri') && !runFitness(data.profile, t)
  const needsFtp = (cfg.sport === 'bike' || cfg.sport === 'tri') && !data.profile.ftp.length && !data.profile.hrMax && !data.profile.birthYear
  const needsCss = (cfg.sport === 'swim' || cfg.sport === 'tri') && !data.profile.css.length

  const create = () => {
    const raceSec = parseTime(race.time)
    const t400 = parseTime(swim.t400)
    const t200 = parseTime(swim.t200)
    if ((needsRun && raceSec) || (needsFtp && ftp) || (needsCss && t400 && t200)) {
      updateProfile((p) => {
        if (needsRun && raceSec) p.raceResults.push({ date: t, distanceM: race.dist, timeSec: raceSec })
        if (needsFtp && ftp) p.ftp.push({ date: t, value: ftp, source: 'user' })
        if (needsCss && t400 && t200 && t400 > t200) p.css.push({ date: t, value: cssPace(t400, t200), t400, t200, source: 'user' })
      })
    }
    updateProfile((p) => {
      if (!p.sports.includes(finalCfg.sport)) p.sports.push(finalCfg.sport)
    })
    const fresh = useStore.getState().data
    const cfgNow = mode === 'week' ? weekCfg.cfg : alignWithPlans(cfg, others, daysTouched)
    void fresh
    const id = createPlan(name?.trim() || autoName, cfgNow, mode === 'week' ? ['entlastung'] : def.basis, {
      align: false,
      templateId: mode === 'template' ? `${cfg.sport}:${cfg.goal}:${cfg.level}` : undefined,
      followsPlanId: fromPlan && fromMode === 'folge' ? fromPlan.id : undefined,
      goal:
        mode === 'week'
          ? undefined
          : {
              sport: cfg.sport,
              type: cfg.raceDate ? (cfg.targetTimeSec ? 'time' : 'race') : cfg.sport === 'gym' ? 'strength' : 'fitness',
              title: `${SPORT_NAME[cfg.sport]}: ${def.name}${cfg.targetTimeSec ? ` in ${fmtTime(cfg.targetTimeSec)}` : ''}`,
              date: cfg.raceDate,
              distanceKm: cfg.distanceKm,
              targetTimeSec: cfg.targetTimeSec,
              main,
            },
    })
    if (addTest && mode !== 'week') {
      const builder = cfg.sport === 'bike' ? 'bike.test' : cfg.sport === 'swim' ? 'swim.test' : 'run.test'
      const first = useStore.getState().data.sessions.filter((s) => s.planId === id && s.weekIndex === 0)
      const free = Array.from({ length: 7 }, (_, i) => addDays(cfgNow.startDate, i)).find((d) => !first.some((s) => s.date === d || s.date === addDays(d, 1) || s.date === addDays(d, -1))) ?? addDays(cfgNow.startDate, 1)
      addSession(id, free, { builder, p: {} })
    }
    nav(`/plan/${id}`, { replace: true })
  }

  const preview = sessions.length > 0 && (
    <Section title={mode === 'week' ? 'Vorschau der Woche' : 'Vorschau des Plans'}>
      <Card className="flex flex-col gap-4">
        {mode !== 'week' && (
          <>
            <div>
              <p className="font-medium">
                {finalCfg.weeks} Wochen, {fmtDate(finalCfg.startDate)} bis {fmtDate(addDays(weekStartDate(finalCfg, finalCfg.weeks - 1), 6), true)}
              </p>
              <p className="num text-[14px] leading-5 text-ink2">
                {fmtVol(weeks[0].volume, unit)} bis {fmtVol(Math.max(...weeks.map((w) => w.volume)), unit)} {unit} pro Woche · {weeks.filter((w) => w.deload).length} Entlastungswochen{taper ? ` · ${taper} ${taper === 1 ? 'Woche' : 'Wochen'} Tapering` : ''}
              </p>
            </div>
            <ChartFrame yLabel={`${unit} pro Woche`} legend={[{ label: 'Aufbau', color: 'var(--ink2)' }, { label: 'Entlastung (E), Tapering (T)', color: 'var(--ink2)', hollow: true }]} note="Jeder Balken ist eine Woche. Antippen zeigt die Einheiten dieser Woche">
              <BarChart bars={weeks.map((w) => ({ label: String(w.index + 1), plan: w.volume, hollow: w.deload || w.taper, mark: w.deload ? 'E' : w.taper ? 'T' : undefined, highlight: w.index === shown }))} fmtY={(v) => fmtVol(v, unit)} onSelect={setSel} />
            </ChartFrame>
            <p className="text-[13px] font-medium leading-5 text-ink3">
              Woche {shown + 1}
              {weeks[shown]?.deload ? ' · Entlastung' : weeks[shown]?.taper ? ' · Tapering' : ' · Beispielwoche'}
            </p>
          </>
        )}
        <div className="-mx-4 -mb-4 divide-y divide-line border-t border-line">
          {sessions.filter((s) => s.weekIndex === (mode === 'week' ? 0 : shown)).map((s) => (
            <div key={s.id} className="pointer-events-none">
              <SessionRow s={s} showDate />
            </div>
          ))}
        </div>
      </Card>
      {aligned && <Note>Um {others.length === 1 ? `„${others[0].plan.name}“` : 'deine aktiven Pläne'} herum gebaut: Entlastungswochen fallen in dieselben Kalenderwochen, harte Tage liegen versetzt{daysTouched ? '' : ', die Trainingstage sind entsprechend vorgeschlagen'}</Note>}
    </Section>
  )

  return (
    <Page title={fromPlan ? (fromMode === 'folge' ? 'Folgeplan' : 'Plan kopieren') : 'Neuer Plan'} sub={`Schritt ${step} von 3`} back>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-accent' : 'bg-line-strong'}`} />
        ))}
      </div>

      {step === 1 && (
        <>
          <Field label="Was möchtest du anlegen?">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'template', label: 'Vorlage' }, { value: 'custom', label: 'Eigener Plan' }, { value: 'week', label: 'Einzelne Woche' }]} />
          </Field>
          <Field label="Sportart">
            <Chips values={[cfg.sport]} onToggle={(s) => applyTemplate(s, GOALS[s][0].id, cfg.level)} options={SPORTS.map((s) => ({ value: s, label: SPORT_NAME[s] }))} />
          </Field>
          <Field label="Niveau" hint={['Du trainierst seit Kurzem oder unregelmäßig', 'Du trainierst seit über einem Jahr regelmäßig', 'Du trainierst seit Jahren strukturiert und viel'][cfg.level]}>
            <Segmented value={cfg.level} onChange={(l) => (mode === 'week' ? set({ level: l }) : applyTemplate(cfg.sport, cfg.goal, l))} options={LEVEL_NAME.map((n, i) => ({ value: i as Level, label: n }))} />
          </Field>
          {mode === 'week' ? (
            <Field label="Wochenvorlage">
              <div className="flex flex-col gap-2">
                {WEEK_TEMPLATES.filter((w) => w.sport === cfg.sport).map((w) => (
                  <button key={w.id} aria-pressed={weekTpl === w.id} onClick={() => setWeekTpl(w.id)} className={`press rounded-[12px] border p-3 text-left ${weekTpl === w.id ? 'border-ink bg-raised' : 'border-line'}`}>
                    <span className="block font-medium">{w.name}</span>
                    <span className="block text-[13px] leading-5 text-ink2">
                      {w.note} · {fmtVol(w.volume[cfg.level], VOLUME_UNIT[w.sport])} {VOLUME_UNIT[w.sport]}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="Ziel">
              <div className="flex flex-col gap-2">
                {GOALS[cfg.sport].map((g) => (
                  <button key={g.id} aria-pressed={cfg.goal === g.id} onClick={() => applyTemplate(cfg.sport, g.id, cfg.level)} className={`press rounded-[12px] border p-3 text-left ${cfg.goal === g.id ? 'border-ink bg-raised' : 'border-line'}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{g.name}</span>
                      <span className="num shrink-0 text-[13px] text-ink3">
                        {g.levels[cfg.level][0]} Wochen · {g.levels[cfg.level][1]} pro Woche
                      </span>
                    </span>
                    <span className="block text-[13px] leading-5 text-ink2">{g.note}</span>
                  </button>
                ))}
                {mode === 'template' &&
                  data.customTemplates.filter((c) => c.config.sport === cfg.sport).map((c) => (
                    <button key={c.id} onClick={() => { setCfg({ ...c.config, startDate: cfg.startDate }); setName(c.name); setDaysTouched(true); setStep(2) }} className="press rounded-[12px] border border-line p-3 text-left">
                      <span className="block font-medium">{c.name}</span>
                      <span className="block text-[13px] leading-5 text-ink2">Eigene Vorlage · {c.config.weeks} Wochen</span>
                    </button>
                  ))}
              </div>
            </Field>
          )}
          <Button kind="primary" full onClick={() => setStep(2)}>
            Weiter
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          {exp && fromMode === 'folge' && fromPlan && (
            <Section title={`Erfahrungen aus „${fromPlan.name}“`}>
              <Card>
                <p className="num text-[14px] leading-6 text-ink2">
                  {exp.done} von {exp.planned} Einheiten erledigt ({Math.round(exp.compliance * 100)} %)
                  <br />
                  Zuletzt tatsächlich trainiert: {fmtVol(exp.recentActual, unit)} {unit} pro Woche (Soll am Anfang: {fmtVol(fromPlan.config.startVolume, unit)})
                  <br />
                  Höchster Wochenumfang: {fmtVol(exp.peakActual, unit)} {unit}
                  {exp.toleratedRamp !== undefined && (
                    <>
                      <br />
                      Gut vertragene Steigerung: {Math.round(exp.toleratedRamp)} % pro Woche
                    </>
                  )}
                </p>
                <p className="mt-2 text-[14px] leading-5">{exp.suggestion.text}. Die Werte unten sind entsprechend vorbelegt</p>
              </Card>
            </Section>
          )}

          {mode === 'week' ? (
            <Field label="In welche Kalenderwoche?" hint={`Woche ab ${fmtDate(startOfWeek(weekDate, wsNum), true)}`}>
              <TextInput type="date" value={weekDate} onChange={(v) => v && setWeekDate(v)} />
            </Field>
          ) : (
            <>
              <Field label="Termin">
                <Segmented
                  value={dateMode}
                  onChange={(m) => {
                    setDateMode(m)
                    if (m === 'start') set({ raceDate: undefined, startDate: nextMonday })
                    else {
                      const rd = addDays(nextMonday, cfg.weeks * 7 - 1)
                      set({ raceDate: rd, startDate: startForRace(rd, cfg.weeks, wsNum) })
                    }
                  }}
                  options={[{ value: 'start', label: 'Starttermin' }, { value: 'race', label: 'Zieldatum (Wettkampf)' }]}
                />
              </Field>
              {dateMode === 'start' ? (
                <Field label="Start" hint={`Der Plan beginnt in der Woche ab ${fmtDate(startOfWeek(cfg.startDate, wsNum), true)}`}>
                  <TextInput type="date" value={cfg.startDate} onChange={(v) => v && set({ startDate: startOfWeek(v, wsNum) })} />
                </Field>
              ) : (
                <Field label="Zieldatum" hint={`Der Plan rechnet rückwärts: Start am ${fmtDate(cfg.startDate, true)}, mit Tapering vor dem Ziel`}>
                  <TextInput type="date" value={cfg.raceDate ?? ''} onChange={(v) => v && set({ raceDate: v, startDate: startForRace(v, cfg.weeks, wsNum) })} />
                </Field>
              )}
              {(cfg.sport === 'run' || cfg.sport === 'tri') && dateMode === 'race' && (
                <Field label="Zielzeit, optional" hint="Zum Beispiel 1:45:00 oder 49:30">
                  <TextInput mode="text" value={timeText} placeholder="h:mm:ss" onChange={(v) => { setTimeText(v); set({ targetTimeSec: parseTime(v) && v.includes(':') ? parseTime(v) : undefined }) }} />
                </Field>
              )}
              {(cfg.goal === 'ultra' || (cfg.sport === 'bike' && mode === 'custom')) && (
                <Field label="Distanz">
                  <NumInput value={cfg.distanceKm} onChange={(v) => set({ distanceKm: v })} unit="km" />
                </Field>
              )}
              {(cfg.sport === 'run' || cfg.sport === 'bike') && (
                <Field label="Profil" hint={cfg.terrain === 'hilly' ? (cfg.sport === 'run' ? 'Mit Höhenmeter-Vorgaben, Bergintervallen und Bergab-Training' : 'Mit längeren Belastungen an der Schwelle und Kraftausdauer am Berg') : undefined}>
                  <Segmented value={cfg.terrain} onChange={(v: Terrain) => set({ terrain: v })} options={cfg.sport === 'run' ? [{ value: 'flat', label: 'Flach' }, { value: 'hilly', label: 'Bergig' }] : [{ value: 'flat', label: 'Flach' }, { value: 'rolling', label: 'Wellig' }, { value: 'hilly', label: 'Bergig' }]} />
                </Field>
              )}
              {cfg.sport === 'gym' && (
                <Field label="Aufteilung">
                  <Segmented value={cfg.split ?? 'full'} onChange={(v: GymSplit) => set({ split: v })} options={[{ value: 'full', label: 'Ganzkörper' }, { value: 'upperLower', label: 'Ober/Unter' }, { value: 'ppl', label: 'Push/Pull/Beine' }]} />
                </Field>
              )}
              <Field label="An welchen Tagen hast du Zeit?" hint={`${cfg.sessionsPerWeek} Einheiten pro Woche`}>
                <Chips
                  values={finalCfg.days}
                  onToggle={(d) => {
                    const cur = finalCfg.days
                    setDaysTouched(true)
                    set({ days: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() })
                  }}
                  options={Array.from({ length: 7 }, (_, i) => (i + wsNum) % 7).map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))}
                />
              </Field>

              {mode === 'custom' && (
                <Section title="Baukasten">
                  <Card className="flex flex-col gap-4">
                    <div className="flex gap-3">
                      <Field label="Dauer in Wochen">
                        <Stepper value={cfg.weeks} min={1} max={52} onChange={(v) => set({ weeks: v, startDate: cfg.raceDate ? startForRace(cfg.raceDate, v, wsNum) : cfg.startDate })} />
                      </Field>
                      <Field label="Einheiten pro Woche">
                        <Stepper value={cfg.sessionsPerWeek} min={1} max={cfg.sport === 'tri' ? 9 : 7} onChange={(v) => { set({ sessionsPerWeek: v, days: daysTouched ? cfg.days : defaultDays(Math.min(6, v)) }) }} />
                      </Field>
                    </div>
                    <div className="flex gap-3">
                      <Field label="Startumfang pro Woche">
                        <NumInput value={cfg.startVolume} onChange={(v) => set({ startVolume: v ?? 0 })} unit={unit} decimal />
                      </Field>
                      <Field label="Steigerung pro Woche">
                        <Stepper value={cfg.rampPct} min={0} max={20} step={0.5} format={(v) => `${v.toLocaleString('de-DE')} %`} onChange={(v) => set({ rampPct: v })} />
                      </Field>
                    </div>
                    <Field label={<><Term id="Deload">Entlastungswoche</Term></>} hint={DELOAD_WHY}>
                      <Segmented value={cfg.deloadEvery} onChange={(v: 3 | 4) => set({ deloadEvery: v })} options={[{ value: 4, label: 'Jede vierte Woche' }, { value: 3, label: 'Jede dritte Woche' }]} />
                    </Field>
                    <Field label="Ausrichtung der Einheiten">
                      <Select value={cfg.focus} onChange={(v: Focus) => set({ focus: v })} options={cfg.sport === 'gym' ? FOCUS_GYM : FOCUS_ENDURANCE} />
                    </Field>
                  </Card>
                </Section>
              )}

              {(needsRun || needsFtp || needsCss) && (
                <Section title="Dein Leistungsstand">
                  <Card className="flex flex-col gap-4">
                    <p className="text-[14px] leading-5 text-ink2">Damit in den Einheiten konkrete Werte stehen. Ohne Angabe beschreibt die App das Tempo nach Gefühl und rechnet mit einer Schätzung nach deinem Niveau</p>
                    {needsRun && (
                      <div className="flex gap-3">
                        <Field label="Eine aktuelle Laufzeit über">
                          <Select value={race.dist} onChange={(d) => setRace({ ...race, dist: d })} options={RACE_DIST} />
                        </Field>
                        <Field label="Zeit">
                          <TextInput value={race.time} placeholder="mm:ss" onChange={(v) => setRace({ ...race, time: v })} />
                        </Field>
                      </div>
                    )}
                    {needsFtp && (
                      <Field label={<Term id="FTP" />} hint="Ohne FTP steuert der Plan über Puls. Trage dann im Profil Maximalpuls oder Geburtsjahr ein">
                        <NumInput value={ftp} onChange={setFtp} unit="W" />
                      </Field>
                    )}
                    {needsCss && (
                      <div className="flex gap-3">
                        <Field label="400 m auf Zeit">
                          <TextInput value={swim.t400} placeholder="m:ss" onChange={(v) => setSwim({ ...swim, t400: v })} />
                        </Field>
                        <Field label="200 m auf Zeit">
                          <TextInput value={swim.t200} placeholder="m:ss" onChange={(v) => setSwim({ ...swim, t200: v })} />
                        </Field>
                      </div>
                    )}
                    {cfg.sport !== 'gym' && cfg.sport !== 'tri' && (
                      <button role="checkbox" aria-checked={addTest} onClick={() => setAddTest(!addTest)} className="press flex min-h-11 items-center gap-3 text-left">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border ${addTest ? 'border-ink bg-primary text-on-primary' : 'border-line-strong'}`}>{addTest ? '✓' : ''}</span>
                        <span className="text-[14px] leading-5">Stattdessen einen kurzen Test in der ersten Woche einplanen</span>
                      </button>
                    )}
                  </Card>
                </Section>
              )}
            </>
          )}

          {issues.map((i, k) => (
            <Note key={k} tone={i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info'} action={i.fix && <Button small onClick={() => { set(i.fix!.patch); if (i.fix!.patch.days) setDaysTouched(true) }}>{i.fix.label}</Button>}>
              {i.text}
            </Note>
          ))}
          {preview}
          <div className="flex gap-2">
            {!fromPlan && <Button full onClick={() => setStep(1)}>Zurück</Button>}
            <Button kind="primary" full disabled={errors.length > 0} onClick={() => setStep(3)}>
              Weiter
            </Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Name des Plans">
            <TextInput value={name ?? autoName} onChange={setName} />
          </Field>
          {mode !== 'week' && data.goals.length > 0 && (
            <button role="checkbox" aria-checked={main} onClick={() => setMain(!main)} className="press flex min-h-11 items-center gap-3 text-left">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border ${main ? 'border-ink bg-primary text-on-primary' : 'border-line-strong'}`}>{main ? '✓' : ''}</span>
              <span className="text-[14px] leading-5">Das ist mein Hauptziel. Bei Konflikten hat dieser Plan Vorrang</span>
            </button>
          )}
          {issues.map((i, k) => (
            <Note key={k} tone={i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info'}>
              {i.text}
            </Note>
          ))}
          {preview}
          {mode !== 'week' && (
            <Section title="Worauf beruht dieser Plan">
              <List>
                <div className="px-4 py-3 text-[14px] leading-5 text-ink2">{def.note}. Die Quellen und Grenzen stehen nach dem Anlegen im Plan</div>
              </List>
            </Section>
          )}
          <div className="flex gap-2">
            <Button full onClick={() => setStep(2)}>Zurück</Button>
            <Button kind="primary" full disabled={errors.length > 0 || sessions.length === 0} onClick={create}>
              {mode === 'week' ? 'Woche einplanen' : 'Plan anlegen'}
            </Button>
          </div>
        </>
      )}
    </Page>
  )
}

export { weekday }
