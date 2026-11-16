import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkValue, SPORT_NAME } from '../logic/templates'
import type { Sport } from '../logic/types'
import { estimateHrMax } from '../logic/zones'
import { updateProfile, useStore } from '../store'
import { Button, Chips, Field, Note, NumInput, Select, TextInput } from '../ui/base'
import { WeekStrip } from '../ui/session'
import { DISCLAIMER } from './Profile'

export default function Onboarding() {
  const p = useStore((s) => s.data.profile)
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(p.name)
  const [year, setYear] = useState(p.birthYear)
  const [sex, setSex] = useState<string>(p.sex ?? '')
  const [hrMax, setHrMax] = useState(p.hrMax)
  const [hrRest, setHrRest] = useState(p.hrRest)
  const [sports, setSports] = useState<Sport[]>(p.sports)
  const errs = [checkValue('birthYear', year), checkValue('hrMax', hrMax), checkValue('hrRest', hrRest, { hrMax })].filter((x): x is string => !!x)

  const finish = (to: string) => {
    updateProfile((x) => {
      x.name = name.trim()
      x.birthYear = year
      x.sex = (sex || undefined) as typeof x.sex
      x.hrMax = hrMax
      x.hrRest = hrRest
      x.sports = sports
      x.disclaimerSeen = true
      x.onboarded = true
    })
    nav(to, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col px-5 pb-8 pt-[max(env(safe-area-inset-top),20px)]">
      <div className="flex gap-1 py-3" aria-hidden>
        {[0, 1, 2, 3].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-accent' : 'bg-line-strong'}`} />
        ))}
      </div>
      <div key={step} className="enter flex flex-1 flex-col gap-5 pt-6">
        {step === 0 && (
          <>
            <div className="pointer-events-none w-40 opacity-90">
              <WeekStrip
                weekStart="2026-01-05"
                height={56}
                sessions={[40, 55, 0, 70, 35, 0, 110].flatMap((m, i) => (m ? [{ id: String(i), planId: '', weekIndex: 0, date: `2026-01-${String(5 + i).padStart(2, '0')}`, discipline: 'run' as const, kind: (['easy', 'intervals', 'easy', 'threshold', 'strength', 'easy', 'long'] as const)[i], title: '', steps: [], durationMin: m, load: 0, hard: false, key: false, deload: false, status: i < 4 ? ('done' as const) : ('planned' as const) }] : []))}
              />
            </div>
            <div>
              <h1 className="text-[28px] font-medium leading-9">MyPlan</h1>
              <p className="mt-2 text-[17px] leading-6 text-ink2">Trainingspläne für Laufen, Rad, Schwimmen, Triathlon und Kraft. Alles bleibt auf diesem Gerät</p>
            </div>
            <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4 text-[14px] leading-5 text-ink2">
              <p className="font-medium text-ink">Bevor es losgeht</p>
              {DISCLAIMER.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
            <div className="mt-auto">
              <Button kind="primary" full onClick={() => setStep(1)}>
                Verstanden, weiter
              </Button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div>
              <h1 className="text-[24px] font-medium leading-8">Über dich</h1>
              <p className="mt-1 text-ink2">Aus diesen Angaben berechnet die App deine Pulszonen. Alles lässt sich später im Profil ändern</p>
            </div>
            <Field label="Name, optional">
              <TextInput value={name} onChange={setName} />
            </Field>
            <div className="flex gap-3">
              <Field label="Geburtsjahr">
                <NumInput value={year} onChange={setYear} placeholder="z. B. 1988" />
              </Field>
              <Field label="Geschlecht">
                <Select value={sex} onChange={setSex} options={[{ value: '', label: 'Keine Angabe' }, { value: 'f', label: 'Weiblich' }, { value: 'm', label: 'Männlich' }, { value: 'd', label: 'Divers' }]} />
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label="Maximalpuls, falls bekannt" hint={!hrMax && year && !checkValue('birthYear', year) ? `Leer: geschätzt ${estimateHrMax(year)}` : undefined}>
                <NumInput value={hrMax} onChange={setHrMax} />
              </Field>
              <Field label="Ruhepuls, falls bekannt">
                <NumInput value={hrRest} onChange={setHrRest} />
              </Field>
            </div>
            {errs.map((e) => (
              <Note key={e} tone="bad">{e}</Note>
            ))}
            <div className="mt-auto flex gap-2">
              <Button full onClick={() => { setYear(p.birthYear); setHrMax(p.hrMax); setHrRest(p.hrRest); setStep(2) }}>Überspringen</Button>
              <Button kind="primary" full disabled={errs.length > 0} onClick={() => setStep(2)}>Weiter</Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div>
              <h1 className="text-[24px] font-medium leading-8">Deine Sportarten</h1>
              <p className="mt-1 text-ink2">Die App fragt nur nach Werten, die du dafür brauchst</p>
            </div>
            <Chips values={sports} onToggle={(s) => setSports((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} options={(['run', 'bike', 'swim', 'tri', 'gym'] as Sport[]).map((s) => ({ value: s, label: SPORT_NAME[s] }))} />
            <div className="mt-auto flex gap-2">
              <Button full onClick={() => setStep(1)}>Zurück</Button>
              <Button kind="primary" full onClick={() => setStep(3)}>{sports.length ? 'Weiter' : 'Überspringen'}</Button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div>
              <h1 className="text-[24px] font-medium leading-8">Ziel und erster Plan</h1>
              <p className="mt-1 text-ink2">Wähle im nächsten Schritt ein Ziel, zum Beispiel 10 km oder Muskelaufbau. Die App schlägt einen Plan vor, den du vor dem Anlegen siehst</p>
            </div>
            <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4 text-[14px] leading-5 text-ink2">
              <p><span className="font-medium text-ink">Heute</span> zeigt, was ansteht</p>
              <p><span className="font-medium text-ink">Plan</span> zeigt Woche und Kalender</p>
              <p><span className="font-medium text-ink">Analyse</span> beantwortet, ob du besser wirst</p>
              <p><span className="font-medium text-ink">Erholung</span> wertet HRV und Ruhepuls aus</p>
              <p><span className="font-medium text-ink">Profil</span> enthält deine Werte und die Datensicherung</p>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <Button kind="primary" full onClick={() => finish('/plan/neu')}>Ersten Plan anlegen</Button>
              <Button full onClick={() => finish('/')}>Später</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
