import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EXERCISES, exerciseName, MUSCLES } from '../logic/exercises'
import type { Discipline, LoggedSet, Session } from '../logic/types'
import { refsFromProfile, workWeight } from '../logic/zones'
import { completeSession, logFreeActivity, uid, useStore, type ManualLog } from '../store'
import { Button, Chips, Field, NumInput, Select, Sheet, Term, TextInput } from '../ui/base'

interface SetRow extends Partial<LoggedSet> {
  key: string
  exerciseId: string
}

/** Einheit von Hand eintragen: Dauer, Distanz, Anstrengung bzw. Übungen, Sätze, Wiederholungen, Gewicht, RIR */
export default function LogSheet({ session, free, onClose }: { session?: Session; free?: { discipline: Discipline; date: string }; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const patch = useStore((s) => s.patch)
  const open = !!session || !!free
  const disc = session?.discipline ?? free?.discipline ?? 'run'
  const isGym = disc === 'gym'
  const [dur, setDur] = useState<number | undefined>()
  const [dist, setDist] = useState<number | undefined>()
  const [hr, setHr] = useState<number | undefined>()
  const [rpe, setRpe] = useState<number | undefined>()
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<SetRow[]>([])
  const [addEx, setAddEx] = useState('squat')
  const [newEx, setNewEx] = useState<{ name: string; muscles: string[] } | undefined>()

  useEffect(() => {
    if (!open) return
    setDur(session?.durationMin)
    setDist(session?.distanceKm ? (disc === 'swim' ? session.distanceKm * 1000 : session.distanceKm) : undefined)
    setHr(undefined)
    setRpe(undefined)
    setNote('')
    const refs = refsFromProfile(data.profile)
    setRows(
      (session?.gym ?? []).flatMap((g) =>
        Array.from({ length: g.sets }, () => ({ key: uid(), exerciseId: g.exerciseId, reps: Number(g.reps.match(/\d+/)?.[0]) || undefined, kg: workWeight(refs, g.exerciseId, g.pct1rm), rir: g.rir })),
      ),
    )
  }, [session?.id, free?.date, free?.discipline, open])

  if (!open) return null
  const all = [...EXERCISES.map((e) => ({ value: e.id, label: e.name })), ...data.customExercises.map((e) => ({ value: e.id, label: e.name }))]
  const sets: LoggedSet[] = rows.filter((r) => r.reps && r.reps > 0).map((r) => ({ exerciseId: r.exerciseId, reps: r.reps!, kg: r.kg ?? 0, rir: r.rir }))
  const valid = isGym ? sets.length > 0 || (dur ?? 0) > 0 : (dur ?? 0) > 0
  const set = (key: string, p: Partial<SetRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const groups = [...new Set(rows.map((r) => r.exerciseId))]

  const save = () => {
    const log: ManualLog = {
      durationMin: dur ?? Math.max(20, sets.length * 3),
      distanceKm: dist ? (disc === 'swim' ? dist / 1000 : dist) : undefined,
      avgHr: hr,
      rpe,
      sets: isGym && sets.length ? sets : undefined,
      note: note || undefined,
    }
    if (session) completeSession(session.id, log)
    else if (free) logFreeActivity(free.discipline, free.date, log)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={session ? 'Einheit eintragen' : 'Einheit ohne Datei eintragen'}>
      {isGym && (
        <div className="flex flex-col gap-4">
          {groups.map((id) => (
            <div key={id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{exerciseName(id, data.customExercises)}</span>
                <button className="press h-10 px-2 text-[13px] text-ink2" onClick={() => setRows((rs) => [...rs, { ...rs.filter((r) => r.exerciseId === id).slice(-1)[0], key: uid(), exerciseId: id }])}>
                  Satz dazu
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_44px] gap-2 text-[12px] leading-4 text-ink3">
                <span>Wiederholungen</span>
                <span>Gewicht</span>
                <span>
                  <Term id="RIR" />
                </span>
                <span />
              </div>
              {rows
                .filter((r) => r.exerciseId === id)
                .map((r) => (
                  <div key={r.key} className="grid grid-cols-[1fr_1fr_1fr_44px] gap-2">
                    <NumInput value={r.reps} onChange={(v) => set(r.key, { reps: v })} />
                    <NumInput value={r.kg} onChange={(v) => set(r.key, { kg: v })} unit="kg" decimal />
                    <NumInput value={r.rir} onChange={(v) => set(r.key, { rir: v })} />
                    <button aria-label="Satz entfernen" className="press flex h-12 items-center justify-center text-ink3" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Field label="Übung hinzufügen">
              <Select value={addEx} onChange={setAddEx} options={all} />
            </Field>
            <Button label="Übung hinzufügen" onClick={() => setRows((rs) => [...rs, { key: uid(), exerciseId: addEx }])}>
              <Plus size={18} strokeWidth={1.5} />
            </Button>
          </div>
          {newEx ? (
            <div className="flex flex-col gap-3 rounded-[12px] border border-line p-3">
              <Field label="Name der eigenen Übung">
                <TextInput value={newEx.name} onChange={(name) => setNewEx({ ...newEx, name })} />
              </Field>
              <Field label="Beanspruchte Muskelgruppen">
                <Chips values={newEx.muscles} onToggle={(m) => setNewEx({ ...newEx, muscles: newEx.muscles.includes(m) ? newEx.muscles.filter((x) => x !== m) : [...newEx.muscles, m] })} options={MUSCLES.map((m) => ({ value: m, label: m }))} />
              </Field>
              <div className="flex gap-2">
                <Button full small onClick={() => setNewEx(undefined)}>Abbrechen</Button>
                <Button
                  full
                  small
                  kind="primary"
                  disabled={!newEx.name.trim()}
                  onClick={() => {
                    const id = `eigen-${uid()}`
                    patch((d) => d.customExercises.push({ id, name: newEx.name.trim(), muscles: newEx.muscles, pattern: 'Eigene' }))
                    setRows((rs) => [...rs, { key: uid(), exerciseId: id }])
                    setNewEx(undefined)
                  }}
                >
                  Anlegen
                </Button>
              </div>
            </div>
          ) : (
            <Button kind="quiet" small onClick={() => setNewEx({ name: '', muscles: [] })}>Eigene Übung anlegen</Button>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <Field label="Dauer">
          <NumInput value={dur} onChange={setDur} unit="min" />
        </Field>
        {!isGym && disc !== 'mobility' && (
          <Field label="Distanz">
            <NumInput value={dist} onChange={setDist} unit={disc === 'swim' ? 'm' : 'km'} decimal />
          </Field>
        )}
        {!isGym && (
          <Field label="Ø Puls, optional">
            <NumInput value={hr} onChange={setHr} />
          </Field>
        )}
      </div>
      <Field label={<><Term id="RPE">Gefühlte Anstrengung</Term> von 1 (sehr leicht) bis 10 (alles gegeben)</>}>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} aria-pressed={rpe === n} onClick={() => setRpe(rpe === n ? undefined : n)} className={`press num h-11 rounded-[8px] border text-[14px] ${rpe === n ? 'border-ink bg-primary text-on-primary' : 'border-line bg-raised text-ink2'}`}>
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Notiz, optional">
        <TextInput value={note} onChange={setNote} />
      </Field>
      <Button kind="primary" full disabled={!valid} onClick={save}>
        Speichern
      </Button>
    </Sheet>
  )
}
