import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, diffDays, fmtDate, fmtDay, fmtDuration, today } from '../logic/dates'
import { parseFile, summarizeActivity, type RecoveryDay } from '../logic/importer'
import type { Discipline } from '../logic/types'
import { commitImport, importRecoveryDays, prepareImport, useStore, type ImportItem } from '../store'
import { Button, Card, Empty, Field, List, Note, Page, Row, Section, Select } from '../ui/base'
import { DISC_NAME, SportIcon } from '../ui/marks'
import LogSheet from './LogSheet'

interface Item extends ImportItem {
  use: boolean
}

export default function ImportScreen() {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [errors, setErrors] = useState<{ file: string; text: string; warn?: boolean }[]>([])
  const [recovery, setRecovery] = useState<RecoveryDay[]>([])
  const [busy, setBusy] = useState(false)
  const [free, setFree] = useState<Discipline | undefined>()
  const [doneMsg, setDoneMsg] = useState<string | undefined>()
  const t = today()

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setDoneMsg(undefined)
    const errs: typeof errors = []
    const raws = []
    const rec: RecoveryDay[] = []
    for (const f of Array.from(files)) {
      try {
        const res = parseFile(f.name, new Uint8Array(await f.arrayBuffer()))
        if (res.error) errs.push({ file: f.name, text: res.error })
        if (res.note) errs.push({ file: f.name, text: res.note, warn: true })
        raws.push(...res.activities)
        rec.push(...res.recoveryDays)
      } catch {
        errs.push({ file: f.name, text: 'Die Datei ließ sich nicht öffnen' })
      }
    }
    const prepared = prepareImport(data, raws).map((i) => ({ ...i, use: !i.duplicate }))
    setItems(prepared)
    setErrors(errs)
    setRecovery(rec)
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  const setItem = (i: number, p: Partial<Item>) => setItems((list) => list.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const candidates = (it: Item) =>
    data.sessions
      .filter((s) => Math.abs(diffDays(s.date, it.activity.date)) <= 3 && s.status !== 'skipped' && (!s.activityId || s.id === it.matchId) && data.plans.find((p) => p.id === s.planId)?.status !== 'ended')
      .sort((a, b) => Math.abs(diffDays(a.date, it.activity.date)) - Math.abs(diffDays(b.date, it.activity.date)))
  const chosen = items.filter((i) => i.use)
  const recent = [...data.activities].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12)

  return (
    <Page title="Import" back>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => void pick(e.target.files)} />
      <Card>
        <p className="font-medium">Dateien aus Garmin Connect oder Whoop</p>
        <p className="mt-1 text-[14px] leading-5 text-ink2">GPX, TCX, FIT und CSV. Mehrere Dateien auf einmal sind möglich. FIT enthält Puls, Leistung und Trittfrequenz am vollständigsten</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button kind="primary" full disabled={busy} onClick={() => input.current?.click()}>
            <FileUp size={18} strokeWidth={1.5} /> {busy ? 'Lese Dateien' : 'Dateien auswählen'}
          </Button>
          <Button full onClick={() => setFree((data.profile.sports[0] === 'tri' || !data.profile.sports[0] ? 'run' : data.profile.sports[0]) as Discipline)}>
            Einheit ohne Datei eintragen
          </Button>
        </div>
      </Card>

      {doneMsg && <Note tone="good">{doneMsg}</Note>}
      {errors.map((e, i) => (
        <Note key={i} tone={e.warn ? 'warn' : 'bad'}>
          <span className="font-medium text-ink">{e.file}:</span> {e.text}
        </Note>
      ))}

      {recovery.length > 0 && (
        <Note
          action={
            <Button
              small
              kind="primary"
              onClick={() => {
                const n = importRecoveryDays(recovery)
                setRecovery([])
                setDoneMsg(`Erholungsdaten für ${n} ${n === 1 ? 'Woche' : 'Wochen'} übernommen`)
              }}
            >
              Erholungsdaten übernehmen
            </Button>
          }
        >
          {recovery.length} Tageswerte für HRV, Ruhepuls oder Schlaf gefunden ({fmtDate(recovery.map((r) => r.date).sort()[0])} bis {fmtDate(recovery.map((r) => r.date).sort().pop()!)}). Sie werden zu Wochenwerten gemittelt
        </Note>
      )}

      {items.length > 0 && (
        <Section title="Erkannte Einheiten: bitte prüfen">
          {items.map((it, i) => {
            const a = it.activity
            const cands = candidates(it)
            return (
              <Card key={i} className="flex flex-col gap-3">
                <button role="checkbox" aria-checked={it.use} onClick={() => setItem(i, { use: !it.use })} className="press flex items-start gap-3 text-left">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border ${it.use ? 'border-ink bg-primary text-on-primary' : 'border-line-strong'}`}>{it.use ? '✓' : ''}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {DISC_NAME[a.discipline]}, {fmtDay(a.date)}
                    </span>
                    <span className="num block text-[14px] leading-5 text-ink2">
                      {fmtDuration(a.durationSec / 60)}
                      {a.distanceM ? ` · ${(a.distanceM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : ''}
                      {a.elevationM ? ` · ${a.elevationM} Hm` : ''}
                      {a.avgHr ? ` · Puls ${a.avgHr}` : ''}
                      {a.avgPower ? ` · ${a.avgPower} W` : ''}
                    </span>
                    <span className="block truncate text-[13px] leading-5 text-ink3">{a.fileName}</span>
                  </span>
                </button>
                {it.duplicate && <Note tone="warn">Diese Einheit ist schon vorhanden und wird nicht noch einmal importiert. Haken setzen, um sie trotzdem zu übernehmen</Note>}
                {it.raw.guessed && <Note>Die Sportart stand nicht eindeutig in der Datei. Bitte prüfen</Note>}
                {it.use && (
                  <div className="flex gap-3">
                    <Field label="Sportart">
                      <Select
                        value={a.discipline}
                        onChange={(d: Discipline) => {
                          const raw = { ...it.raw, discipline: d, guessed: false }
                          const [re] = prepareImport({ ...data, activities: [] }, [raw])
                          setItem(i, { raw, activity: summarizeActivity(raw, data.profile, a.id), matchId: re.matchId, confidence: re.confidence })
                        }}
                        options={(['run', 'bike', 'swim', 'gym', 'mobility'] as Discipline[]).map((d) => ({ value: d, label: DISC_NAME[d] }))}
                      />
                    </Field>
                    <Field label="Gehört zu" hint={it.matchId ? (it.confidence === 'möglich' ? 'Anderer Tag, bitte bestätigen' : undefined) : 'Keine passende geplante Einheit'}>
                      <Select
                        value={it.matchId ?? ''}
                        onChange={(v) => setItem(i, { matchId: v || undefined, confidence: 'sicher' })}
                        options={[{ value: '', label: 'Keine geplante Einheit' }, ...cands.map((s) => ({ value: s.id, label: `${fmtDate(s.date)}: ${s.title}` }))]}
                      />
                    </Field>
                  </div>
                )}
              </Card>
            )
          })}
          <Button
            kind="primary"
            full
            disabled={chosen.length === 0}
            onClick={() => {
              commitImport(chosen.map((c) => ({ activity: c.activity, matchId: c.matchId })))
              setDoneMsg(`${chosen.length} ${chosen.length === 1 ? 'Einheit' : 'Einheiten'} importiert`)
              setItems([])
            }}
          >
            {chosen.length} {chosen.length === 1 ? 'Einheit' : 'Einheiten'} übernehmen
          </Button>
        </Section>
      )}

      <Section title="Zuletzt erfasst">
        {recent.length === 0 ? (
          <Empty title="Noch keine Einheiten importiert" text="Exportiere eine Aktivität aus Garmin Connect oder Whoop und wähle die Datei hier aus" action={<Button onClick={() => input.current?.click()}>Datei auswählen</Button>} />
        ) : (
          <List>
            {recent.map((a) => (
              <Row
                key={a.id}
                left={<SportIcon d={a.discipline} />}
                title={`${DISC_NAME[a.discipline]}, ${fmtDate(a.date)}`}
                sub={`${fmtDuration(a.durationSec / 60)}${a.distanceM ? ` · ${(a.distanceM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : ''} · ${a.source === 'manual' ? 'von Hand' : a.source.toUpperCase()}`}
                onClick={() => nav(`/aktivitaet/${a.id}`)}
              />
            ))}
          </List>
        )}
      </Section>

      {free && (
        <FreeLog discipline={free} setDiscipline={setFree} date={t} onClose={() => setFree(undefined)} />
      )}
    </Page>
  )
}

function FreeLog({ discipline, setDiscipline, date, onClose }: { discipline: Discipline; setDiscipline: (d: Discipline) => void; date: string; onClose: () => void }) {
  const [d, setD] = useState(date)
  const [stage, setStage] = useState<1 | 2>(1)
  if (stage === 2) return <LogSheet free={{ discipline, date: d }} onClose={onClose} />
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button aria-label="Schließen" className="fade-in absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="sheet-in relative flex w-full max-w-[560px] flex-col gap-4 rounded-t-[18px] border border-b-0 border-line bg-card p-4 pb-[max(env(safe-area-inset-bottom),20px)]">
        <h2 className="text-[17px] font-medium">Einheit ohne Datei</h2>
        <Field label="Sportart">
          <Select value={discipline} onChange={setDiscipline} options={(['run', 'bike', 'swim', 'gym', 'mobility'] as Discipline[]).map((x) => ({ value: x, label: DISC_NAME[x] }))} />
        </Field>
        <Field label="Tag">
          <Select value={d} onChange={setD} options={Array.from({ length: 14 }, (_, i) => addDays(date, -i)).map((x) => ({ value: x, label: fmtDay(x) }))} />
        </Field>
        <Button kind="primary" full onClick={() => setStage(2)}>
          Weiter
        </Button>
      </div>
    </div>
  )
}
