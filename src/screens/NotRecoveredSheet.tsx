import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { today } from '../logic/dates'
import { evaluateRecovery, notRecovered, overuse, SYMPTOMS, type Alternative } from '../logic/recovery'
import type { Session } from '../logic/types'
import { chooseAlternative, ctxFor, setPlanStatus, useStore, weekStartOf } from '../store'
import { Button, Chips, cx, Field, Note, NumInput, Sheet, Term } from '../ui/base'
import { sessionMeta } from '../ui/marks'
import { weekSessions } from '../view'

export default function NotRecoveredSheet({ session, onClose }: { session?: Session; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const nav = useNavigate()
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [hrv, setHrv] = useState<number | undefined>()
  const [rhr, setRhr] = useState<number | undefined>()
  const [step, setStep] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<Alternative['id'] | undefined>()
  useEffect(() => {
    if (session) {
      setSymptoms([])
      setHrv(undefined)
      setRhr(undefined)
      setStep(1)
      setPicked(undefined)
    }
  }, [session?.id])

  const result = useMemo(() => {
    if (!session || step !== 2) return undefined
    const ws = weekStartOf(data, session.date)
    const lastWeek = [...data.recovery].sort((a, b) => a.week.localeCompare(b.week)).pop()?.week
    const plan = data.plans.find((p) => p.id === session.planId)
    return notRecovered({
      session,
      symptoms,
      hrvToday: hrv,
      rhrToday: rhr,
      week: weekSessions(data, ws),
      weekStart: ws,
      today: today(),
      lastEval: lastWeek ? evaluateRecovery(data.recovery, lastWeek) : undefined,
      ctx: ctxFor(data, plan?.config.level ?? 1),
    })
  }, [session, step, symptoms, hrv, rhr, data])

  if (!session) return null
  const chosen = result?.alternatives.find((a) => a.id === (picked ?? result.alternatives.find((x) => x.recommended)?.id))
  const over = overuse(data.readiness, today())
  const labels = symptoms.map((id) => SYMPTOMS.find((s) => s.id === id)?.label ?? id)

  return (
    <Sheet open onClose={onClose} title="Nicht gut erholt">
      {step === 1 ? (
        <>
          <p className="text-[14px] leading-5 text-ink2">Wie geht es dir? Die App macht daraus Vorschläge für „{session.title}“. Du entscheidest</p>
          <Chips values={symptoms} onToggle={(v) => setSymptoms((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))} options={SYMPTOMS.map((s) => ({ value: s.id, label: s.label }))} />
          <div className="flex gap-3">
            <Field label={<><Term id="HRV" /> heute, optional</>}>
              <NumInput value={hrv} onChange={setHrv} unit="ms" />
            </Field>
            <Field label="Ruhepuls heute, optional">
              <NumInput value={rhr} onChange={setRhr} unit="Schläge" />
            </Field>
          </div>
          <Button kind="primary" full disabled={symptoms.length === 0 && hrv === undefined && rhr === undefined} onClick={() => setStep(2)}>
            Vorschläge zeigen
          </Button>
        </>
      ) : (
        result && (
          <>
            {result.note && <Note tone={result.illness ? 'bad' : 'info'}>{result.note}</Note>}
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Alternativen">
              {result.alternatives.map((a) => {
                const on = chosen?.id === a.id
                return (
                  <button key={a.id} role="radio" aria-checked={on} onClick={() => setPicked(a.id)} className={cx('press flex gap-3 rounded-[12px] border p-3 text-left', on ? 'border-ink bg-raised' : 'border-line')}>
                    <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-ink' : 'border-line-strong')}>{on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        {a.recommended && <span className="rounded-[6px] border border-accent px-1.5 text-[12px] leading-5 text-accent-ink">Empfehlung</span>}
                      </span>
                      <span className="block text-[14px] leading-5 text-ink">
                        {a.detail}
                        {a.built ? ` · ${sessionMeta(a.built)}` : ''}
                      </span>
                      <span className="mt-1 block text-[13px] leading-5 text-ink2">{a.reason}</span>
                      {a.consequence && <span className="mt-1 block text-[13px] leading-5 text-ink3">{a.consequence}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            {over.count >= 3 && (
              <Note tone="warn">
                Du nutzt diese Funktion zum {over.count + 1}. Mal in vier Wochen. Der Plan könnte insgesamt zu hart sein. Im Plan lassen sich Umfang und Steigerung senken
              </Note>
            )}
            <div className="flex gap-2">
              <Button full onClick={() => setStep(1)}>Zurück</Button>
              <Button
                full
                kind="primary"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return
                  chooseAlternative(session.id, chosen, symptoms, labels.join(', ') || 'Nicht gut erholt')
                  onClose()
                }}
              >
                Übernehmen
              </Button>
            </div>
            {result.illness && (
              <Button
                kind="quiet"
                full
                onClick={() => {
                  setPlanStatus(session.planId, 'paused')
                  onClose()
                  nav(`/plan/${session.planId}`)
                }}
              >
                Plan pausieren, bis ich wieder gesund bin
              </Button>
            )}
          </>
        )
      )}
    </Sheet>
  )
}
