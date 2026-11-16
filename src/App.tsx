import { Activity, CalendarDays, HeartPulse, Sun, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { onBack, scheduleReminder } from './native'
import ActivityScreen from './screens/ActivityScreen'
import Analysis from './screens/Analysis'
import ImportScreen from './screens/ImportScreen'
import Onboarding from './screens/Onboarding'
import PlanDetail from './screens/PlanDetail'
import PlanTab from './screens/PlanTab'
import PlanWizard from './screens/PlanWizard'
import Profile from './screens/Profile'
import Recovery from './screens/Recovery'
import SessionDetail from './screens/SessionDetail'
import Today from './screens/Today'
import { useStore } from './store'
import { cx, Toast } from './ui/base'

const TABS = [
  { to: '/', label: 'Heute', icon: Sun },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/analyse', label: 'Analyse', icon: Activity },
  { to: '/erholung', label: 'Erholung', icon: HeartPulse },
  { to: '/profil', label: 'Profil', icon: UserRound },
]

function useTheme() {
  const theme = useStore((s) => s.data.profile.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121213' : '#fafafa')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const onboarded = useStore((s) => s.data.profile.onboarded)
  const reminder = useStore((s) => s.data.profile.reminder)
  const loc = useLocation()
  const nav = useNavigate()
  useTheme()

  useEffect(() => {
    if (loaded) void scheduleReminder(reminder)
  }, [loaded, reminder])

  useEffect(
    () =>
      onBack(() => {
        if (window.location.hash === '#/' || window.location.hash === '') return false
        nav(-1)
        return true
      }),
    [nav],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  if (!loaded) return <div className="flex h-full items-center justify-center text-ink3">MyPlan</div>
  if (!onboarded && loc.pathname !== '/start') return <Navigate to="/start" replace />
  const bare = loc.pathname === '/start'

  return (
    <>
      <main className="min-h-full">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/start" element={<Onboarding />} />
          <Route path="/plan" element={<PlanTab />} />
          <Route path="/plan/neu" element={<PlanWizard />} />
          <Route path="/plan/:id" element={<PlanDetail />} />
          <Route path="/einheit/:id" element={<SessionDetail />} />
          <Route path="/aktivitaet/:id" element={<ActivityScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/analyse" element={<Analysis />} />
          <Route path="/analyse/:id" element={<Analysis />} />
          <Route path="/erholung" element={<Recovery />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/profil/:section" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!bare && (
        <nav aria-label="Bereiche" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex h-16 max-w-[560px]">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => cx('press flex flex-1 flex-col items-center justify-center gap-1 text-[12px] leading-4', isActive ? 'font-medium text-ink' : 'text-ink3')}>
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-7 w-12 items-center justify-center rounded-[8px]', isActive && 'bg-raised')}>
                      <t.icon size={20} strokeWidth={1.5} />
                    </span>
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      <Toast />
    </>
  )
}
