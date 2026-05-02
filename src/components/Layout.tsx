import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, PlusCircle, Upload, Settings } from 'lucide-react'
import { useStore } from '../store'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'ホーム' },
  { to: '/transactions', icon: List, label: '明細' },
  { to: '/add', icon: PlusCircle, label: '入力' },
  { to: '/import', icon: Upload, label: 'CSV' },
  { to: '/settings', icon: Settings, label: '設定' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const darkMode = useStore((s) => s.settings.darkMode)

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  return (
    <div className="min-h-screen bg-bg text-text dark:bg-gray-900 dark:text-gray-100 flex flex-col max-w-md mx-auto">
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around py-2 z-50">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-gray-400'
              }`
            }
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
