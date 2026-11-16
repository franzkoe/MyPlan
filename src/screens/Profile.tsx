import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { makeBackup, parseBackup } from '../db'
import { fmtDate, fmtTime, parseTime, today, WEEKDAYS } from '../logic/dates'
import { BASE_LIFTS, exerciseName } from '../logic/exercises'
import { checkValue, SPORT_NAME } from '../logic/templates'
import { emptyData, latest, type AppData, type Dated, type Profile as P, type Sport } from '../logic/types'
import { cssPace, effectiveHrMax, estimateHrMax, hrZones, pacesFromVdot, powerZones, refsFromProfile, renderText, runFitness } from '../logic/zones'
import { isNative, saveFile, scheduleReminder } from '../native'
import { updateProfile, useStore } from '../store'
import { Button, Card, Chips, Confirm, Field, List, Note, NumInput, Page, Row, Section, Segmented, Select, Term, TextInput } from '../ui/base'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function setDated<T extends Dated<number>>(list: T[], value: number | undefined, extra: Partial<T> = {}): T[] {
  const t = today()
  const rest = list.filter((e) => e.date !== t)
  return value === undefined ? rest : [...rest, { date: t, value, source: 'user', ...extra } as T]
}

/** Alles, was aus dem Profil berechnet wird, als Zeilen zum Vergleichen */
function derive(p: P, data: AppData): [string, string][] {
  const out: [string, string][] = []
  const t = today()
  hrZones(p, 'run')?.zones.forEach((z) => out.push([`Puls Zone ${z.n} (${z.name})`, `${z.lo}–${z.hi}`]))
  if (p.bikeHr && (p.bikeHr.hrMax || p.bikeHr.lthr)) hrZones(p, 'bike')?.zones.forEach((z) => out.push([`Rad: Puls Zone ${z.n}`, `${z.lo}–${z.hi}`]))
  const ftp = latest(p.ftp)?.value
  if (ftp) powerZones(ftp).slice(0, 6).forEach((z) => out.push([`Leistung Zone ${z.n} (${z.name})`, `${z.lo}–${z.hi} W`]))
  const fit = runFitness(p, t)
  if (fit) {
    const pc = pacesFromVdot(fit.vdot)
    out.push(['Lockeres Tempo', `${fmtTime(pc.E[0])}–${fmtTime(pc.E[1])} min/km`], ['Marathontempo', `${fmtTime(pc.M)} min/km`], ['Schwellentempo', `${fmtTime(pc.T)} min/km`], ['Intervalltempo', `${fmtTime(pc.I)} min/km`])
  }
  const css = latest(p.css)?.value
  if (css) out.push(['Schwimmtempo (CSS)', `${fmtTime(css)} min/100 m`])
  const next = data.sessions.filter((s) => s.status === 'planned' && s.date >= t && data.plans.find((x) => x.id === s.planId)?.status === 'active').sort((a, b) => a.date.localeCompare(b.date))
  const refs = refsFromProfile(p, t)
  const seen = new Set<string>()
  for (const s of next) {
    if (seen.has(s.discipline) || s.discipline === 'gym' || s.discipline === 'mobility') continue
    seen.add(s.discipline)
    const main = s.steps.find((x) => x.part === 'Hauptteil')
    if (main) out.push([`Nächste Einheit „${s.title}“`, renderText(main.text, refs)])
  }
  return out
}

const SECTIONS: { id: string; title: string; sub: (p: P) => string; sports?: Sport[] }[] = [
  { id: 'person', title: 'Persönliche Daten', sub: (p) => [p.name, p.birthYear, latest(p.weight) ? `${latest(p.weight)!.value} kg` : ''].filter(Boolean).join(' · ') || 'Name, Geburtsjahr, Größe, Gewicht' },
  { id: 'puls', title: 'Herzfrequenz und Zonen', sub: (p) => hrZones(p)?.basis ?? 'Noch keine Werte: Maximalpuls oder Geburtsjahr fehlt' },
  { id: 'laufen', title: 'Laufen', sub: (p) => runFitness(p)?.detail ?? 'Noch kein Leistungsstand', sports: ['run', 'tri'] },
  { id: 'rad', title: 'Rad', sub: (p) => (latest(p.ftp) ? `FTP ${latest(p.ftp)!.value} W` : 'Noch keine FTP: Steuerung über Puls'), sports: ['bike', 'tri'] },
  { id: 'schwimmen', title: 'Schwimmen', sub: (p) => (latest(p.css) ? `CSS ${fmtTime(latest(p.css)!.value)} min/100 m` : 'Noch kein CSS-Wert'), sports: ['swim', 'tri'] },
  { id: 'kraft', title: 'Kraft', sub: (p) => `${Object.values(p.oneRm).filter((l) => l.length).length} von ${BASE_LIFTS.length} Grundübungen mit Maximalwert`, sports: ['gym'] },
  { id: 'darstellung', title: 'Einheiten und Darstellung', sub: (p) => `${p.units.distance}, ${p.units.weight} · Woche beginnt ${p.weekStart === 0 ? 'montags' : 'sonntags'} · ${{ system: 'Schema wie das Handy', light: 'helles Schema', dark: 'dunkles Schema' }[p.theme]}` },
  { id: 'erinnerung', title: 'Erinnerung', sub: (p) => (p.reminder.enabled ? `${WEEKDAYS[p.reminder.weekday]}s um ${p.reminder.time} Uhr` : 'Ausgeschaltet') },
  { id: 'daten', title: 'Daten sichern und wiederherstellen', sub: () => 'Exportieren, importieren, löschen' },
  { id: 'hinweis', title: 'Gesundheit und Grenzen', sub: () => 'Was die App kann und was nicht' },
]

export const DISCLAIMER = [
  'MyPlan ersetzt keinen Arzt und keinen Trainer. Die Pläne folgen anerkannter Trainingslehre, kennen aber weder deine Vorgeschichte noch deine Gesundheit.',
  'Lass dich ärztlich durchchecken, bevor du ein intensives Programm beginnst, besonders nach längerer Pause, ab etwa 35 Jahren oder mit Vorerkrankungen.',
  'Die App stellt keine Diagnosen. Auswertungen von HRV und Puls sind Hinweise zur Trainingssteuerung. Bei Schmerzen, Schwindel, Brustenge oder anhaltender Erschöpfung: Training abbrechen und ärztlich abklären.',
]

export default function Profile() {
  const { section } = useParams()
  const nav = useNavigate()
  const data = useStore((s) => s.data)
  const replaceAll = useStore((s) => s.replaceAll)
  const say = useStore((s) => s.say)
  const p = data.profile
  const [d, setD] = useState<P>(() => clone(p))
  const [msg, setMsg] = useState<string | undefined>()
  const [confirm, setConfirm] = useState<'delete' | 'import' | undefined>()
  const [pending, setPending] = useState<AppData | undefined>()
  const [race, setRace] = useState({ dist: 10000, time: '' })
  const [tp, setTp] = useState('')
  const [swim, setSwim] = useState({ t400: '', t200: '' })
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setD(clone(p))
    setMsg(undefined)
    setTp(latest(p.thresholdPace) ? fmtTime(latest(p.thresholdPace)!.value) : '')
    const c = latest(p.css) as (typeof p.css)[number] | undefined
    setSwim({ t400: c?.t400 ? fmtTime(c.t400) : '', t200: c?.t200 ? fmtTime(c.t200) : '' })
  }, [section, data.profile])

  const set = (fn: (x: P) => void) =>
    setD((cur) => {
      const n = clone(cur)
      fn(n)
      return n
    })
  const dirty = JSON.stringify(d) !== JSON.stringify(p)
  const changes = useMemo(() => {
    if (!dirty) return []
    const a = new Map(derive(p, data))
    const b = derive(d, data)
    const out: { label: string; before?: string; after: string }[] = []
    for (const [k, v] of b) if (a.get(k) !== v) out.push({ label: k, before: a.get(k), after: v })
    return out
  }, [d, dirty])

  const hrMax = effectiveHrMax(d)
  const errors = [
    checkValue('hrMax', d.hrMax),
    checkValue('hrRest', d.hrRest, { hrMax: hrMax?.value }),
    checkValue('lthr', d.lthr, { hrMax: hrMax?.value, hrRest: d.hrRest }),
    checkValue('birthYear', d.birthYear),
    checkValue('height', d.heightCm),
    checkValue('weight', latest(d.weight)?.value),
    checkValue('ftp', latest(d.ftp)?.value),
    checkValue('thresholdPace', latest(d.thresholdPace)?.value),
    checkValue('css', latest(d.css)?.value),
    ...d.vo2max.map((v) => checkValue('vo2max', v.value)),
    d.hrMethod === 'manual' && d.hrManual && d.hrManual.some((v, i) => i > 0 && v <= d.hrManual![i - 1]) ? 'Die Zonengrenzen müssen von Zone 1 bis 5 ansteigen' : undefined,
  ].filter((x): x is string => !!x)

  const save = async () => {
    updateProfile((x) => Object.assign(x, d), 'Profil gespeichert')
    if (section === 'erinnerung') {
      const r = await scheduleReminder(d.reminder, true)
      setMsg(r === 'denied' ? 'Android hat Benachrichtigungen für MyPlan nicht erlaubt. Erlaube sie in den Einstellungen des Handys unter Apps, MyPlan, Benachrichtigungen' : r === 'browser' ? 'Im Browser gibt es keine Benachrichtigung. Auf dem Handy erscheint sie wie eingestellt, im Dashboard steht der Hinweis in jedem Fall' : d.reminder.enabled ? 'Erinnerung ist eingerichtet' : 'Erinnerung ist ausgeschaltet')
    }
  }

  const saveBar = dirty && (
    <div className="sticky bottom-20 z-20 flex flex-col gap-2 rounded-[14px] border border-line-strong bg-card p-3 shadow-[0_8px_24px_rgb(0_0_0/0.14)]">
      {changes.length > 0 && (
        <div>
          <p className="text-[13px] font-medium leading-5 text-ink3">Das ändert sich für künftige Einheiten</p>
          <div className="mt-1 max-h-40 overflow-y-auto">
            {changes.slice(0, 14).map((c) => (
              <p key={c.label} className="text-[13px] leading-5 text-ink2">
                {c.label}: <span className="num">{c.before ? `${c.before} → ` : 'neu: '}</span>
                <span className="num text-ink">{c.after}</span>
              </p>
            ))}
          </div>
          <p className="mt-1 text-[12px] leading-4 text-ink3">Erledigte Einheiten behalten die damals gültigen Werte</p>
        </div>
      )}
      {errors.map((e) => (
        <p key={e} className="text-[13px] leading-5 text-bad">{e}</p>
      ))}
      <div className="flex gap-2">
        <Button full small onClick={() => setD(clone(p))}>Verwerfen</Button>
        <Button full small kind="primary" disabled={errors.length > 0} onClick={() => void save()}>Speichern</Button>
      </div>
    </div>
  )

  const history = (list: Dated<number>[], fmt: (v: number) => string) =>
    list.length > 1 ? (
      <p className="num text-[13px] leading-5 text-ink3">
        Verlauf:{' '}
        {[...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((e) => `${fmtDate(e.date)} ${fmt(e.value)}`).join(' · ')}
      </p>
    ) : null

  const vo2 = (sport: 'run' | 'bike') => {
    const list = d.vo2max.filter((v) => v.sport === sport)
    const cur = latest(list)
    return (
      <Card className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Field label={<Term id="VO2max" />} hint="Wird nur genutzt, wenn keine aktuelle Wettkampfzeit vorliegt">
            <NumInput value={cur?.value} onChange={(v) => set((x) => { x.vo2max = [...x.vo2max.filter((e) => e.sport !== sport), ...setDated(list, v, { sport, source: cur?.source === 'lab' ? 'lab' : 'watch' } as never)] })} unit="ml/kg/min" decimal />
          </Field>
          <Field label="Herkunft">
            <Select value={cur?.source === 'lab' ? 'lab' : 'watch'} onChange={(src) => set((x) => { x.vo2max = x.vo2max.map((e) => (e.sport === sport && e.date === cur?.date ? { ...e, source: src as 'lab' | 'watch' } : e)) })} options={[{ value: 'watch', label: 'Schätzwert der Uhr' }, { value: 'lab', label: 'Laborwert' }]} />
          </Field>
        </div>
        {history(list, (v) => v.toLocaleString('de-DE'))}
      </Card>
    )
  }

  if (!section) {
    const show = SECTIONS.filter((s) => !s.sports || s.sports.some((x) => p.sports.includes(x)))
    return (
      <Page title="Profil">
        <Section title="Meine Sportarten">
          <Card>
            <Chips values={p.sports} onToggle={(s) => updateProfile((x) => { x.sports = x.sports.includes(s) ? x.sports.filter((y) => y !== s) : [...x.sports, s] })} options={(['run', 'bike', 'swim', 'tri', 'gym'] as Sport[]).map((s) => ({ value: s, label: SPORT_NAME[s] }))} />
            <p className="mt-3 text-[13px] leading-5 text-ink3">Die App zeigt nur Felder und Auswertungen für die gewählten Sportarten</p>
          </Card>
        </Section>
        <Section title="Werte und Einstellungen">
          <List>
            {show.map((s) => (
              <Row key={s.id} title={s.title} sub={s.sub(p)} onClick={() => nav(`/profil/${s.id}`)} />
            ))}
          </List>
        </Section>
      </Page>
    )
  }

  const title = SECTIONS.find((s) => s.id === section)?.title ?? 'Profil'
  const zr = hrZones(d, 'run')

  return (
    <Page title={title} back="/profil">
      {section === 'person' && (
        <>
          <Field label="Name">
            <TextInput value={d.name} onChange={(v) => set((x) => { x.name = v })} />
          </Field>
          <div className="flex gap-3">
            <Field label="Geburtsjahr" hint="Für die Schätzung des Maximalpulses">
              <NumInput value={d.birthYear} onChange={(v) => set((x) => { x.birthYear = v })} />
            </Field>
            <Field label="Geschlecht">
              <Select value={d.sex ?? ''} onChange={(v) => set((x) => { x.sex = (v || undefined) as P['sex'] })} options={[{ value: '', label: 'Keine Angabe' }, { value: 'f', label: 'Weiblich' }, { value: 'm', label: 'Männlich' }, { value: 'd', label: 'Divers' }]} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="Größe">
              <NumInput value={d.heightCm} onChange={(v) => set((x) => { x.heightCm = v })} unit="cm" />
            </Field>
            <Field label="Gewicht">
              <NumInput value={latest(d.weight)?.value} onChange={(v) => set((x) => { x.weight = setDated(x.weight, v) })} unit="kg" decimal />
            </Field>
          </div>
          {history(d.weight, (v) => `${v.toLocaleString('de-DE')} kg`)}
        </>
      )}

      {section === 'puls' && (
        <>
          <div className="flex gap-3">
            <Field label="Maximalpuls" source={d.hrMax ? 'von dir eingetragen' : hrMax ? 'geschätzt' : undefined} hint={!d.hrMax && d.birthYear ? `Leer: geschätzt ${estimateHrMax(d.birthYear)} aus dem Alter (±10 Schläge)` : !d.hrMax ? 'Oder Geburtsjahr unter Persönliche Daten eintragen' : undefined}>
              <NumInput value={d.hrMax} onChange={(v) => set((x) => { x.hrMax = v })} />
            </Field>
            <Field label="Ruhepuls">
              <NumInput value={d.hrRest} onChange={(v) => set((x) => { x.hrRest = v })} />
            </Field>
          </div>
          <Field label={<>Puls an der <Term id="Schwelle" /> (Laktatschwelle)</>} hint="Durchschnittspuls der letzten 20 min eines 30-Minuten-Tests">
            <NumInput value={d.lthr} onChange={(v) => set((x) => { x.lthr = v })} />
          </Field>
          <Field label="Berechnung der Zonen" hint={d.hrMethod === 'karvonen' && !d.hrRest ? 'Dafür fehlt der Ruhepuls' : d.hrMethod === 'lthr' && !d.lthr ? 'Dafür fehlt der Schwellenpuls' : undefined}>
            <Select
              value={d.hrMethod}
              onChange={(v) => set((x) => { x.hrMethod = v; if (v === 'manual' && !x.hrManual) x.hrManual = (hrZones({ ...x, hrMethod: 'max' })?.zones ?? []).map((z) => z.lo) })}
              options={[{ value: 'max', label: 'Prozent vom Maximalpuls' }, { value: 'karvonen', label: 'Herzfrequenzreserve (Karvonen)' }, { value: 'lthr', label: 'Prozent vom Schwellenpuls' }, { value: 'manual', label: 'Von Hand festlegen' }]}
            />
          </Field>
          {d.hrMethod === 'manual' && d.hrManual && (
            <Card className="flex flex-col gap-2">
              <p className="text-[13px] leading-5 text-ink3">Untergrenze jeder Zone in Schlägen pro Minute</p>
              <div className="grid grid-cols-5 gap-2">
                {d.hrManual.map((v, i) => (
                  <Field key={i} label={`Zone ${i + 1}`}>
                    <NumInput value={v} onChange={(n) => set((x) => { x.hrManual![i] = n ?? 0 })} />
                  </Field>
                ))}
              </div>
            </Card>
          )}
          <Section title="Deine Zonen">
            {zr ? (
              <>
                <List>
                  {zr.zones.map((z) => (
                    <Row key={z.n} title={`Zone ${z.n} · ${z.name}`} right={<span className="num">{z.lo}–{z.hi}</span>} />
                  ))}
                </List>
                <p className="px-1 text-[13px] leading-5 text-ink3">Berechnet {zr.basis}{zr.source === 'estimate' ? '. Der Maximalpuls ist geschätzt; ein gemessener Wert macht die Zonen genauer' : ''}</p>
              </>
            ) : (
              <p className="px-1 text-[14px] text-ink3">Trage den Maximalpuls oder dein Geburtsjahr ein, dann berechnet die App die Zonen</p>
            )}
          </Section>
          {p.sports.some((s) => s === 'bike' || s === 'tri') && (
            <Section title="Eigene Zonen für das Rad">
              <Card className="flex flex-col gap-3">
                <p className="text-[14px] leading-5 text-ink2">Auf dem Rad liegt der Puls meist 5 bis 10 Schläge tiefer als beim Laufen. Leer lassen, um die Laufzonen zu verwenden</p>
                <div className="flex gap-3">
                  <Field label="Maximalpuls Rad">
                    <NumInput value={d.bikeHr?.hrMax} onChange={(v) => set((x) => { x.bikeHr = { ...x.bikeHr, hrMax: v } })} />
                  </Field>
                  <Field label="Schwellenpuls Rad">
                    <NumInput value={d.bikeHr?.lthr} onChange={(v) => set((x) => { x.bikeHr = { ...x.bikeHr, lthr: v } })} />
                  </Field>
                </div>
              </Card>
            </Section>
          )}
        </>
      )}

      {section === 'laufen' && (
        <>
          <Note>
            {runFitness(d) ? <>Deine Tempobereiche werden {runFitness(d)!.detail} berechnet{runFitness(d)!.estimate ? ' (Schätzung)' : ''}. Reihenfolge: Wettkampfzeit aus den letzten 12 Monaten, sonst Schwellentempo, sonst VO2max</> : 'Trage einen der Werte ein. Eine aktuelle Wettkampfzeit ist am genauesten'}
          </Note>
          <Section title="Wettkampfzeit">
            <Card className="flex flex-col gap-3">
              {[...d.raceResults].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                <div key={r.date + r.distanceM} className="flex items-center justify-between gap-2">
                  <span className="num text-[14px]">
                    {(r.distanceM / 1000).toLocaleString('de-DE')} km in {fmtTime(r.timeSec)} · {fmtDate(r.date, true)}
                  </span>
                  <button className="press h-10 px-2 text-[13px] text-ink2 underline decoration-line-strong underline-offset-4" onClick={() => set((x) => { x.raceResults = x.raceResults.filter((y) => !(y.date === r.date && y.distanceM === r.distanceM)) })}>
                    Entfernen
                  </button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <Field label="Distanz">
                  <Select value={race.dist} onChange={(v) => setRace({ ...race, dist: v })} options={[{ value: 5000, label: '5 km' }, { value: 10000, label: '10 km' }, { value: 21097.5, label: 'Halbmarathon' }, { value: 42195, label: 'Marathon' }]} />
                </Field>
                <Field label="Zeit">
                  <TextInput value={race.time} placeholder="mm:ss" onChange={(v) => setRace({ ...race, time: v })} />
                </Field>
                <Button disabled={!parseTime(race.time) || !race.time.includes(':')} onClick={() => { const sec = parseTime(race.time)!; set((x) => { x.raceResults.push({ date: today(), distanceM: race.dist, timeSec: sec }) }); setRace({ ...race, time: '' }) }}>
                  Dazu
                </Button>
              </div>
            </Card>
          </Section>
          <Field label={<>Tempo an der <Term id="Schwelle" /></>} hint="Tempo, das du etwa eine Stunde halten könntest, in min/km">
            <TextInput value={tp} placeholder="m:ss" onChange={(v) => { setTp(v); const s = v.includes(':') ? parseTime(v) : undefined; set((x) => { x.thresholdPace = setDated(x.thresholdPace, s) }) }} />
          </Field>
          {history(d.thresholdPace, fmtTime)}
          {vo2('run')}
        </>
      )}

      {section === 'rad' && (
        <>
          <Field label={<Term id="FTP" />} hint="95 % der Durchschnittsleistung aus einem 20-Minuten-Test. Ohne FTP steuert der Plan über Puls">
            <NumInput value={latest(d.ftp)?.value} onChange={(v) => set((x) => { x.ftp = setDated(x.ftp, v) })} unit="W" />
          </Field>
          {history(d.ftp, (v) => `${v} W`)}
          {latest(d.ftp) && (
            <Section title="Deine Leistungszonen">
              <List>
                {powerZones(latest(d.ftp)!.value).map((z) => (
                  <Row key={z.n} title={`Zone ${z.n} · ${z.name}`} right={<span className="num">{z.n === 7 ? `ab ${z.lo} W` : `${z.lo}–${z.hi} W`}</span>} />
                ))}
              </List>
              <p className="px-1 text-[13px] leading-5 text-ink3">Berechnet aus FTP {latest(d.ftp)!.value} W nach Coggan</p>
            </Section>
          )}
          {vo2('bike')}
        </>
      )}

      {section === 'schwimmen' && (
        <>
          <Note>
            <Term id="CSS" /> wird aus zwei Testzeiten berechnet: (Zeit über 400 m − Zeit über 200 m) ÷ 2
          </Note>
          <div className="flex gap-3">
            <Field label="400 m auf Zeit">
              <TextInput value={swim.t400} placeholder="m:ss" onChange={(v) => setSwim({ ...swim, t400: v })} />
            </Field>
            <Field label="200 m auf Zeit">
              <TextInput value={swim.t200} placeholder="m:ss" onChange={(v) => setSwim({ ...swim, t200: v })} />
            </Field>
          </div>
          {(() => {
            const a = swim.t400.includes(':') ? parseTime(swim.t400) : undefined
            const b = swim.t200.includes(':') ? parseTime(swim.t200) : undefined
            const ok = a && b && a > b && a < b * 2.6
            const cur = latest(d.css) as (typeof d.css)[number] | undefined
            return (
              <>
                {a && b && !ok && <Note tone="bad">Die Zeiten passen nicht zusammen. Die 400 m müssen länger dauern als die 200 m, aber weniger als das 2,6-Fache</Note>}
                <Button disabled={!ok || (cur?.t400 === a && cur?.t200 === b)} onClick={() => set((x) => { x.css = setDated(x.css, cssPace(a!, b!), { t400: a, t200: b } as never) })}>
                  CSS berechnen: {ok ? `${fmtTime(cssPace(a, b))} min/100 m` : 'Zeiten eintragen'}
                </Button>
              </>
            )
          })()}
          {history(d.css, (v) => `${fmtTime(v)}`)}
        </>
      )}

      {section === 'kraft' && (
        <>
          <Note>
            Dein Maximalgewicht für eine Wiederholung (<Term id="1RM" />) oder eine vorsichtige Schätzung. Daraus rechnet die App die Gewichte in den Einheiten. Aus eingetragenen Sätzen schätzt die Analyse den Wert laufend neu
          </Note>
          <div className="grid grid-cols-2 gap-3">
            {BASE_LIFTS.map((id) => (
              <Field key={id} label={exerciseName(id)}>
                <NumInput value={latest(d.oneRm[id])?.value} onChange={(v) => set((x) => { x.oneRm[id] = setDated(x.oneRm[id] ?? [], v) })} unit="kg" decimal />
              </Field>
            ))}
          </div>
        </>
      )}

      {section === 'darstellung' && (
        <>
          <Field label="Distanz">
            <Segmented value={d.units.distance} onChange={(v) => set((x) => { x.units.distance = v })} options={[{ value: 'km', label: 'Kilometer' }, { value: 'mi', label: 'Meilen' }]} />
          </Field>
          <Field label="Gewicht">
            <Segmented value={d.units.weight} onChange={(v) => set((x) => { x.units.weight = v })} options={[{ value: 'kg', label: 'Kilogramm' }, { value: 'lb', label: 'Pfund' }]} />
          </Field>
          <Field label="Erster Wochentag" hint="Gilt für neue Pläne. Bestehende Pläne behalten ihre Wochen">
            <Segmented value={d.weekStart} onChange={(v) => set((x) => { x.weekStart = v })} options={[{ value: 0, label: 'Montag' }, { value: 6, label: 'Sonntag' }]} />
          </Field>
          <Field label="Farbschema">
            <Segmented value={d.theme} onChange={(v) => set((x) => { x.theme = v })} options={[{ value: 'system', label: 'Wie das Handy' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} />
          </Field>
        </>
      )}

      {section === 'erinnerung' && (
        <>
          <Field label="Wöchentliche Erinnerung an die Erholungsdaten">
            <Segmented value={d.reminder.enabled ? 1 : 0} onChange={(v) => set((x) => { x.reminder.enabled = v === 1 })} options={[{ value: 1, label: 'An' }, { value: 0, label: 'Aus' }]} />
          </Field>
          <div className="flex gap-3">
            <Field label="Wochentag">
              <Select value={d.reminder.weekday} onChange={(v) => set((x) => { x.reminder.weekday = v })} options={WEEKDAYS.map((w, i) => ({ value: i, label: w }))} />
            </Field>
            <Field label="Uhrzeit">
              <TextInput type="time" value={d.reminder.time} onChange={(v) => v && set((x) => { x.reminder.time = v })} />
            </Field>
          </div>
          {msg && <Note tone="good">{msg}</Note>}
          {!dirty && <Button onClick={() => void scheduleReminder(p.reminder, true).then((r) => setMsg(r === 'ok' ? 'Erinnerung ist eingerichtet' : r === 'browser' ? 'Im Browser gibt es keine Benachrichtigung' : 'Android hat Benachrichtigungen für MyPlan nicht erlaubt. Erlaube sie in den Einstellungen des Handys unter Apps, MyPlan, Benachrichtigungen'))}>Benachrichtigung erlauben und einrichten</Button>}
          <Section title="Damit die Erinnerung zuverlässig kommt">
            <Card className="flex flex-col gap-2 text-[14px] leading-5 text-ink2">
              <p>Android spart Akku, indem es selten genutzte Apps einschränkt. Dann kommt die Erinnerung verspätet oder gar nicht. So stellst du das ab:</p>
              <p>1. Einstellungen des Handys öffnen, dann Apps, dann MyPlan</p>
              <p>2. Akku (oder „App-Akkunutzung“) antippen und „Nicht eingeschränkt“ wählen. Bei manchen Herstellern heißt es „Nicht optimieren“ oder „Keine Beschränkungen“</p>
              <p>3. Unter Benachrichtigungen prüfen, dass sie erlaubt sind</p>
              <p>4. Falls vorhanden: „Wecker und Erinnerungen“ erlauben</p>
              <p>Unabhängig davon zeigt die Startseite einen Hinweis, sobald die Eingabe fällig ist</p>
            </Card>
          </Section>
        </>
      )}

      {section === 'daten' && (
        <>
          <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              setPending(parseBackup(await f.text()))
              setConfirm('import')
            } catch (err) {
              setMsg(err instanceof Error ? err.message : 'Die Datei ließ sich nicht lesen')
            }
            e.target.value = ''
          }} />
          <Card>
            <p className="font-medium">Alle Daten liegen nur auf diesem Gerät</p>
            <p className="mt-1 text-[14px] leading-5 text-ink2">Es gibt kein Konto und keinen Server. Sichere deine Daten regelmäßig als Datei, vor allem vor einem Gerätewechsel oder einer Neuinstallation</p>
            <p className="num mt-3 text-[13px] leading-5 text-ink3">
              {data.plans.filter((x) => x.templateId !== 'frei').length} Pläne · {data.sessions.length} Einheiten · {data.activities.length} Aufzeichnungen · {data.recovery.length} Wochen Erholungsdaten
            </p>
          </Card>
          {msg && <Note>{msg}</Note>}
          <Button kind="primary" onClick={async () => {
            try {
              setMsg(await saveFile(`myplan-sicherung-${today()}.json`, makeBackup(data)))
            } catch (err) {
              setMsg(err instanceof Error ? err.message : 'Die Sicherung ist fehlgeschlagen')
            }
          }}>
            Alles exportieren
          </Button>
          {isNative && <p className="px-1 text-[13px] leading-5 text-ink3">Im Teilen-Dialog „In Dateien speichern“ oder „Drive“ wählen, um die Sicherung außerhalb der App abzulegen</p>}
          <Button onClick={() => file.current?.click()}>Sicherung importieren</Button>
          <Button kind="danger" onClick={() => setConfirm('delete')}>Alle Daten löschen</Button>
          <Confirm open={confirm === 'import'} onClose={() => setConfirm(undefined)} title="Sicherung einspielen" text={pending ? `Die Sicherung enthält ${pending.plans.length} Pläne, ${pending.sessions.length} Einheiten und ${pending.activities.length} Aufzeichnungen. Sie ersetzt alle Daten auf diesem Gerät. Das lässt sich direkt danach rückgängig machen` : ''} confirm="Ersetzen" onConfirm={() => { if (pending) { replaceAll(pending); say('Sicherung eingespielt') } }} />
          <Confirm open={confirm === 'delete'} onClose={() => setConfirm(undefined)} title="Alle Daten löschen" text="Pläne, Einheiten, Aufzeichnungen, Erholungsdaten und Profil werden gelöscht. Ohne vorherige Sicherung sind sie nach dem Schließen der App nicht wiederherzustellen" confirm="Alles löschen" danger onConfirm={() => { replaceAll(emptyData()); nav('/start') }} />
        </>
      )}

      {section === 'hinweis' && (
        <Card className="flex flex-col gap-3 leading-6">
          {DISCLAIMER.map((x) => (
            <p key={x}>{x}</p>
          ))}
          <p className="text-[14px] leading-5 text-ink3">Worauf die Pläne beruhen und wo die Studienlage dünn ist, steht in jedem Plan unter „Worauf beruht dieser Plan“</p>
        </Card>
      )}

      {saveBar}
    </Page>
  )
}
