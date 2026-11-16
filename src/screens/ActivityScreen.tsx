import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fmtDay, fmtDuration, fmtTime } from '../logic/dates'
import { exerciseName } from '../logic/exercises'
import { DIST_LABEL, WINDOW_LABEL } from '../logic/analysis'
import { deleteActivity, useStore } from '../store'
import { Button, Card, Confirm, Empty, List, Page, Row, Section, Stat, Term } from '../ui/base'
import { ChartFrame, LineChart, ShareBar } from '../ui/charts'
import { DISC_NAME, ZONE_VAR } from '../ui/marks'

const LOAD_SRC = { power: 'aus Leistung', hr: 'aus Puls', pace: 'aus Tempo', rpe: 'aus gefühlter Anstrengung', duration: 'aus der Dauer geschätzt' }

export default function ActivityScreen() {
  const { id } = useParams()
  const nav = useNavigate()
  const data = useStore((s) => s.data)
  const a = data.activities.find((x) => x.id === id)
  const [del, setDel] = useState(false)
  if (!a)
    return (
      <Page title="Aufzeichnung" back>
        <Empty title="Diese Aufzeichnung gibt es nicht mehr" action={<Button onClick={() => nav('/import')}>Zum Import</Button>} />
      </Page>
    )
  const s = data.sessions.find((x) => x.id === a.sessionId)
  const km = a.distanceM ? a.distanceM / 1000 : undefined
  const pace = km && a.discipline === 'run' ? `${fmtTime(a.durationSec / km)} min/km` : km && a.discipline === 'swim' ? `${fmtTime(a.durationSec / (a.distanceM! / 100))} min/100 m` : km ? `${(km / (a.durationSec / 3600)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km/h` : undefined
  const hr = a.stream?.filter((p) => p[1] > 0) ?? []
  const pw = a.stream?.filter((p) => p[2] > 0) ?? []
  const groups = a.sets ? [...new Set(a.sets.map((x) => x.exerciseId))] : []
  const tick = (list: number[][]) => [0, 0.5, 1].map((f) => ({ x: list[0][0] + (list[list.length - 1][0] - list[0][0]) * f, label: `${Math.round((list[0][0] + (list[list.length - 1][0] - list[0][0]) * f) / 60)} min` }))
  return (
    <Page title={DISC_NAME[a.discipline]} sub={fmtDay(a.date)} back>
      <div className="flex gap-2">
        <Stat label="Dauer" value={fmtDuration(a.durationSec / 60)} />
        {km !== undefined && <Stat label="Distanz" value={a.discipline === 'swim' ? `${a.distanceM} m` : `${km.toLocaleString('de-DE', { maximumFractionDigits: 2 })} km`} sub={pace} />}
      </div>
      <div className="flex gap-2">
        {a.avgHr !== undefined && <Stat label="Ø Puls" value={a.avgHr} sub={a.maxHr ? `max. ${a.maxHr}` : undefined} />}
        {a.avgPower !== undefined && <Stat label="Ø Leistung" value={`${a.avgPower} W`} sub={a.np ? <><Term id="NP" /> {a.np} W</> : undefined} />}
        <Stat label={<Term id="Belastung" />} value={a.load} sub={LOAD_SRC[a.loadSource]} />
      </div>
      <List>
        {a.elevationM !== undefined && <Row title="Höhenmeter" right={<span className="num">{a.elevationM} m</span>} />}
        {a.avgCadence !== undefined && <Row title="Trittfrequenz" right={<span className="num">{a.avgCadence}</span>} />}
        {a.driftPct !== undefined && <Row title={<Term id="Drift" />} right={<span className="num">{a.driftPct.toLocaleString('de-DE')} %</span>} />}
        {a.rpe !== undefined && <Row title="Gefühlte Anstrengung" right={<span className="num">{a.rpe} von 10</span>} />}
        <Row title="Quelle" right={<span className="text-ink2">{a.source === 'manual' ? 'von Hand eingetragen' : `${a.source.toUpperCase()}-Datei`}</span>} sub={a.fileName ?? a.note} />
        {s && <Row title="Geplante Einheit" sub={s.title} onClick={() => nav(`/einheit/${encodeURIComponent(s.id)}`)} />}
      </List>

      {a.hrZoneSec && (
        <Section title="Zeit in den Pulszonen">
          <Card className="flex flex-col gap-2">
            <ShareBar parts={a.hrZoneSec.map((v, i) => ({ label: `Zone ${i + 1}`, value: v, color: ZONE_VAR[i + 1] }))} />
            <p className="text-[13px] leading-5 text-ink3">Berechnet mit den Zonen, die beim Import galten{a.ref?.hrMax ? ` (Maximalpuls ${a.ref.hrMax})` : ''}</p>
          </Card>
        </Section>
      )}
      {hr.length > 5 && (
        <Section title="Pulsverlauf">
          <Card>
            <ChartFrame yLabel="Schläge pro Minute" note="Puls über die Dauer der Einheit">
              <LineChart series={[{ points: hr.map((p) => ({ x: p[0], y: p[1] })), color: 'var(--hard)' }]} xLabels={tick(hr)} />
            </ChartFrame>
          </Card>
        </Section>
      )}
      {pw.length > 5 && (
        <Section title="Leistungsverlauf">
          <Card>
            <ChartFrame yLabel="Watt" note="Leistung über die Dauer der Einheit">
              <LineChart series={[{ points: pw.map((p) => ({ x: p[0], y: p[2] })), color: 'var(--ink2)' }]} xLabels={tick(pw)} zero />
            </ChartFrame>
          </Card>
        </Section>
      )}
      {(a.bestEfforts?.length || a.powerBests?.length) ? (
        <Section title="Schnellste Abschnitte in dieser Einheit">
          <List>
            {a.bestEfforts?.map((b) => <Row key={b.key} title={DIST_LABEL[b.key]} right={<span className="num">{fmtTime(b.value)}</span>} />)}
            {a.powerBests?.map((b) => <Row key={b.key} title={`Beste ${WINDOW_LABEL[b.key]}`} right={<span className="num">{b.value} W</span>} />)}
          </List>
        </Section>
      ) : null}
      {groups.length > 0 && (
        <Section title="Sätze">
          <List>
            {groups.map((g) => (
              <Row key={g} title={exerciseName(g, data.customExercises)} sub={a.sets!.filter((x) => x.exerciseId === g).map((x) => `${x.reps} × ${x.kg.toLocaleString('de-DE')} kg${x.rir !== undefined ? ` (RIR ${x.rir})` : ''}`).join(' · ')} />
            ))}
          </List>
        </Section>
      )}
      <Button kind="quiet" onClick={() => setDel(true)}>Aufzeichnung löschen</Button>
      <Confirm open={del} onClose={() => setDel(false)} title="Aufzeichnung löschen" text="Die Aufzeichnung wird entfernt, die geplante Einheit ist danach wieder offen. Das lässt sich direkt danach rückgängig machen" confirm="Löschen" danger onConfirm={() => { deleteActivity(a.id); nav(-1) }} />
    </Page>
  )
}
