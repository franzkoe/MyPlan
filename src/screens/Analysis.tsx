import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { driftTrend, form, formSentence, ftpEstimate, paceAtSameHr, powerAtSameHr, powerBests, racePrediction, runBests, strengthFindings, swimPace, valueTrend, weeklySetsByMuscle, zoneDistribution, type Finding } from '../logic/analysis'
import { addDays, fmtDate, fmtDuration, fmtTime, today } from '../logic/dates'
import { SPORT_NAME } from '../logic/templates'
import type { Sport } from '../logic/types'
import { useStore, weekStartOf } from '../store'
import { Button, Card, cx, Empty, List, Page, Row, Section, Segmented, Term } from '../ui/base'
import { ChartFrame, dateLabels, dateX, LineChart, ShareBar } from '../ui/charts'
import { DISC_NAME, ZONE_VAR } from '../ui/marks'

type Tab = Sport | 'all'
const WORD = { better: 'Fortschritt', same: 'Unverändert', worse: 'Rückschritt', nodata: 'Zu wenig Daten' } as const

function FindingCard({ f, fmt }: { f: Finding; fmt?: (v: number) => string }) {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const acts = f.activityIds.map((id) => data.activities.find((a) => a.id === id)).filter((a) => !!a).sort((a, b) => b.date.localeCompare(a.date))
  const has = (f.series?.length ?? 0) > 0 || acts.length > 0
  return (
    <Card>
      <button className={cx('block w-full text-left', has && 'press')} aria-expanded={open} onClick={() => has && setOpen(!open)}>
        <span className="flex items-center justify-between gap-2 text-[13px] leading-5 text-ink3">
          <span>{f.title}</span>
          <span className={cx('rounded-[6px] border px-2 text-[12px] leading-5', f.trend === 'better' ? 'border-good text-good' : f.trend === 'worse' ? 'border-bad text-bad' : 'border-line text-ink3')}>{WORD[f.trend]}</span>
        </span>
        <span className="mt-1 block text-[17px] font-medium leading-6">{f.sentence}</span>
        {f.value && <span className="num mt-1 block text-[14px] leading-5 text-ink2">{f.value}</span>}
        {has && <span className="mt-2 block text-[13px] text-ink3 underline decoration-line-strong underline-offset-4">{open ? 'Weniger zeigen' : 'Diagramm und Einheiten zeigen'}</span>}
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
          {f.series && f.series.length > 0 && (
            <ChartFrame yLabel={f.unit} note={f.chartNote ?? 'Jeder Punkt ist ein Wert zum jeweiligen Datum'}>
              <LineChart series={[{ points: f.series.map((p) => ({ x: dateX(p.date), y: p.value })), color: 'var(--accent)', dots: true }]} xLabels={dateLabels(f.series.map((p) => p.date))} fmtY={fmt} invert={f.lowerIsBetter && f.unit !== '%'} />
            </ChartFrame>
          )}
          {acts.length > 0 && (
            <div>
              <p className="mb-1 text-[13px] font-medium leading-5 text-ink3">Einheiten hinter dieser Zahl</p>
              <div className="-mx-4 divide-y divide-line border-y border-line">
                {acts.slice(0, 10).map((a) => (
                  <Row key={a.id} title={`${DISC_NAME[a.discipline]}, ${fmtDate(a.date)}`} sub={`${fmtDuration(a.durationSec / 60)}${a.distanceM ? ` · ${(a.distanceM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : ''}${a.avgHr ? ` · Puls ${a.avgHr}` : ''}`} onClick={() => nav(`/aktivitaet/${a.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function Analysis() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const p = data.profile
  const t = today()
  const sports = (p.sports.length ? p.sports : [...new Set(data.plans.map((x) => x.config.sport))]) as Sport[]
  const tabs: Tab[] = [...sports, 'all']
  const [tab, setTab] = useState<Tab>((params.get('sport') as Tab) ?? tabs[0])
  const acts = data.activities
  const mi = p.units.distance === 'mi'
  const pace = (v: number) => fmtTime(mi ? v * 1.609344 : v)

  const vo2 = (sport: 'run' | 'bike') => {
    const list = p.vo2max.filter((v) => v.sport === sport)
    if (!list.length) return null
    const f = valueTrend(`vo2-${sport}`, 'VO2max', list, 'ml/kg/min', false, (v) => `${v.toLocaleString('de-DE')}`, 1)
    const last = [...list].sort((a, b) => a.date.localeCompare(b.date)).pop()!
    return <FindingCard f={{ ...f, value: `${f.value ?? ''} ml/kg/min · ${last.source === 'lab' ? 'Laborwert' : 'Schätzwert der Uhr'}`, chartNote: 'Deine eingetragenen Werte. Uhrenwerte sind Schätzungen und schwanken um einige Punkte' }} />
  }

  const body = () => {
    if (tab === 'run') {
      const bests = runBests(acts, t)
      const pred = racePrediction(p, t)
      return (
        <>
          <FindingCard f={paceAtSameHr(acts, t, mi)} fmt={pace} />
          <FindingCard f={driftTrend(acts, 'run')} fmt={(v) => v.toLocaleString('de-DE')} />
          {vo2('run')}
          <Section title="Bestzeiten aus deinen Aufzeichnungen">
            {bests.length ? (
              <List>
                {bests.map((b) => (
                  <Row key={b.key} title={b.label} sub={`${fmtDate(b.date, true)}${b.recent ? ' · in den letzten 6 Wochen' : ''}`} right={<span className="num">{fmtTime(b.value)}</span>} onClick={() => nav(`/aktivitaet/${b.activityId}`)} />
                ))}
              </List>
            ) : (
              <p className="px-1 text-[14px] text-ink3">Noch keine Läufe mit Streckenaufzeichnung importiert</p>
            )}
          </Section>
          <Section title="Geschätzte Wettkampfzeiten">
            {pred ? (
              <>
                <List>
                  {pred.rows.map((r) => (
                    <Row key={r.label} title={r.label} right={<span className="num">{r.time}</span>} />
                  ))}
                </List>
                <p className="px-1 text-[13px] leading-5 text-ink3">
                  Berechnet {pred.basis}
                  {pred.estimate ? '. Der Uhrenwert ist eine Schätzung; eine Wettkampfzeit hat Vorrang, sobald du eine einträgst' : ''}. Für längere Distanzen gilt die Prognose nur mit entsprechendem Training
                </p>
              </>
            ) : (
              <Empty title="Noch kein Leistungsstand" text="Trage eine Wettkampfzeit, dein Schwellentempo oder deine VO2max ein" action={<Button onClick={() => nav('/profil/laufen')}>Wert eintragen</Button>} />
            )}
          </Section>
        </>
      )
    }
    if (tab === 'bike') {
      const now = powerBests(acts, t, 42)
      const before = powerBests(acts, t, 42, 42)
      const est = ftpEstimate(acts, t)
      return (
        <>
          <FindingCard f={powerAtSameHr(acts, t)} />
          <FindingCard f={valueTrend('bike-ftp', 'FTP', p.ftp, 'W', false, (v) => `${Math.round(v)} W`, 3)} />
          {est && (!p.ftp.length || Math.abs(est.value - [...p.ftp].sort((a, b) => a.date.localeCompare(b.date)).pop()!.value) >= 5) && (
            <Card onClick={() => nav('/profil/rad')}>
              <span className="block text-[13px] leading-5 text-ink3">FTP aus deinen Fahrten</span>
              <span className="mt-1 block text-[17px] font-medium leading-6">Deine beste 20-Minuten-Leistung der letzten 8 Wochen ergibt etwa {est.value} W</span>
              <span className="mt-1 block text-[14px] leading-5 text-ink2">95 % von {Math.round(est.value / 0.95)} W am {fmtDate(est.date)}. Antippen, um die FTP im Profil anzupassen</span>
            </Card>
          )}
          <FindingCard f={driftTrend(acts, 'bike')} fmt={(v) => v.toLocaleString('de-DE')} />
          {vo2('bike')}
          <Section title="Beste Durchschnittsleistung">
            {now.length || before.length ? (
              <List>
                {[300, 1200, 3600].map((k) => {
                  const a = now.find((x) => x.key === k)
                  const b = before.find((x) => x.key === k)
                  if (!a && !b) return null
                  return <Row key={k} title={`${k / 60} Minuten`} sub={b ? `6 Wochen davor: ${b.value} W` : 'davor kein Vergleichswert'} right={<span className="num">{a ? `${a.value} W` : 'kein Wert'}</span>} onClick={a ? () => nav(`/aktivitaet/${a.activityId}`) : undefined} />
                })}
              </List>
            ) : (
              <p className="px-1 text-[14px] text-ink3">Noch keine Fahrten mit Leistungsmessung importiert</p>
            )}
          </Section>
        </>
      )
    }
    if (tab === 'swim')
      return (
        <>
          <FindingCard f={valueTrend('swim-css', 'CSS', p.css, 'min/100 m', true, (v) => `${fmtTime(v)} min/100 m`, 1)} fmt={fmtTime} />
          <FindingCard f={swimPace(acts, t)} fmt={fmtTime} />
          {!p.css.length && <Empty title="Noch kein CSS-Wert" text="Der Test dauert 40 min: 400 m und 200 m auf Zeit" action={<Button onClick={() => nav('/profil/schwimmen')}>Testzeiten eintragen</Button>} />}
        </>
      )
    if (tab === 'gym') {
      const fs = strengthFindings(acts, t, data.customExercises)
      const sets = weeklySetsByMuscle(acts, weekStartOf(data, t), data.customExercises)
      const prev = weeklySetsByMuscle(acts, addDays(weekStartOf(data, t), -7), data.customExercises)
      return (
        <>
          {fs.length === 0 && <Empty title="Noch keine Krafteinheiten eingetragen" text="Trage bei einer Krafteinheit Sätze, Wiederholungen und Gewicht ein. Daraus schätzt die App dein 1RM" action={<Button onClick={() => nav('/plan')}>Zur Woche</Button>} />}
          {fs.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
          <Section title="Sätze pro Muskelgruppe">
            {sets.length || prev.length ? (
              <List>
                {[...new Set([...sets, ...prev].map((s) => s.muscle))].map((m) => (
                  <Row key={m} title={m} sub={`Vorwoche: ${prev.find((x) => x.muscle === m)?.sets ?? 0}`} right={<span className="num">{sets.find((x) => x.muscle === m)?.sets ?? 0}</span>} />
                ))}
              </List>
            ) : (
              <p className="px-1 text-[14px] text-ink3">In dieser und der letzten Woche sind keine Sätze eingetragen</p>
            )}
            <p className="px-1 text-[13px] leading-5 text-ink3">Diese Woche. Für Muskelaufbau gelten etwa zehn oder mehr Sätze pro Muskelgruppe und Woche als Richtwert</p>
          </Section>
        </>
      )
    }
    // Triathlon und Gesamt: Belastung über alle Sportarten
    const curve = form(acts, t)
    const fs = formSentence(curve)
    const last = curve[curve.length - 1]
    const recent = curve.slice(-84)
    const z = zoneDistribution(acts, addDays(t, -28), t)
    return (
      <>
        <Card>
          <span className="flex items-center justify-between text-[13px] leading-5 text-ink3">
            <span>
              <Term id="CTL" />, <Term id="ATL" /> und <Term id="TSB" />
            </span>
            <span className={cx('rounded-[6px] border px-2 text-[12px] leading-5', fs.trend === 'better' ? 'border-good text-good' : fs.trend === 'worse' ? 'border-bad text-bad' : 'border-line text-ink3')}>{WORD[fs.trend]}</span>
          </span>
          <p className="mt-1 text-[17px] font-medium leading-6">{fs.sentence}</p>
          {last && curve.length >= 28 && (
            <p className="num mt-1 text-[14px] leading-5 text-ink2">
              Fitness {Math.round(last.ctl)} · Ermüdung {Math.round(last.atl)} · Form {Math.round(last.tsb)}
            </p>
          )}
          {recent.length > 13 && (
            <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
              <ChartFrame yLabel="Punkte pro Tag" legend={[{ label: 'Fitness', color: 'var(--ink)' }, { label: 'Ermüdung', color: 'var(--hard)', dashed: true }]} note="Fitness steigt langsam mit regelmäßigem Training, Ermüdung reagiert schnell auf harte Wochen">
                <LineChart series={[{ points: recent.map((x) => ({ x: dateX(x.date), y: x.atl })), color: 'var(--hard)', dashed: true, width: 1.4 }, { points: recent.map((x) => ({ x: dateX(x.date), y: x.ctl })), color: 'var(--ink)' }]} xLabels={dateLabels(recent.map((x) => x.date))} />
              </ChartFrame>
              <ChartFrame yLabel="Form (Fitness minus Ermüdung)" note="Unter null trägst du Ermüdung, über null bist du frisch. Vor einem Wettkampf soll die Form leicht über null liegen">
                <LineChart series={[{ points: recent.map((x) => ({ x: dateX(x.date), y: x.tsb })), color: 'var(--accent)' }]} xLabels={dateLabels(recent.map((x) => x.date))} zero height={140} />
              </ChartFrame>
            </div>
          )}
        </Card>
        <Section title="Zeit in den Pulszonen, letzte 4 Wochen">
          {z ? (
            <Card className="flex flex-col gap-3">
              <p>{z.sentence}</p>
              <ShareBar parts={z.share.map((v, i) => ({ label: `Zone ${i + 1}`, value: v, color: ZONE_VAR[i + 1] }))} />
              <p className="text-[13px] leading-5 text-ink3">Aus {z.count} Aufzeichnungen mit Pulsmessung, alle Sportarten zusammen</p>
            </Card>
          ) : (
            <p className="px-1 text-[14px] text-ink3">Zu wenig Aufzeichnungen mit Pulsmessung. Es braucht mindestens eine Stunde in vier Wochen</p>
          )}
        </Section>
      </>
    )
  }

  return (
    <Page title="Analyse" sub="Werde ich besser?">
      {acts.length === 0 && <Empty title="Noch keine Einheiten erfasst" text="Die Analyse braucht Aufzeichnungen. Importiere Dateien aus Garmin oder Whoop oder hake Einheiten mit eigenen Werten ab" action={<Button kind="primary" onClick={() => nav('/import')}>Datei auswählen</Button>} />}
      {tabs.length > 1 && <Segmented value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x, label: x === 'all' ? 'Gesamt' : SPORT_NAME[x] }))} />}
      {body()}
    </Page>
  )
}
