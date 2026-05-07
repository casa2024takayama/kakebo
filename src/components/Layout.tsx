import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  List,
  PlusCircle,
  CreditCard,
  Settings,
  CalendarRange,
  Wallet,
  X,
} from 'lucide-react'
import { useStore } from '../store'
import { storage } from '../lib/storage'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'ホーム' },
  { to: '/cashflow', icon: Wallet, label: '家計' },
  { to: '/timeline', icon: CalendarRange, label: 'タイムライン' },
  { to: '/cards', icon: CreditCard, label: 'カード' },
  { to: '/add', icon: PlusCircle, label: '入力' },
  { to: '/transactions', icon: List, label: '明細' },
  { to: '/settings', icon: Settings, label: '設定' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const darkMode = useStore((s) => s.settings.darkMode)
  const transactions = useStore((s) => s.transactions)
  const [showMixWarn, setShowMixWarn] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  useEffect(() => {
    // Sprint1: bulk レコードがある かつ 警告未表示なら 1 度だけバナー表示
    const hasBulk = transactions.some((t) => t.kind === 'bulk')
    if (hasBulk && !storage.getWarnedMixedDates()) {
      setShowMixWarn(true)
    }
  }, [transactions])

  const dismissMixWarn = () => {
    storage.saveWarnedMixedDates('1')
    setShowMixWarn(false)
  }

  const testMode = useStore((s) => s.settings.testMode)

  const buildDate = new Date(__BUILD_TIME__).toLocaleString('ja-JP', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="min-h-screen bg-bg text-text dark:bg-gray-900 dark:text-gray-100 flex flex-col max-w-md lg:max-w-6xl mx-auto">
      <div className="fixed top-1 right-2 z-50 text-[10px] text-gray-400 dark:text-gray-500 bg-white/70 dark:bg-gray-900/70 px-1.5 py-0.5 rounded pointer-events-none">
        v{__APP_VERSION__} · {buildDate}
      </div>
      {testMode && (
        <div className="sticky top-0 z-40 bg-danger text-white px-3 py-1.5 text-center text-xs font-semibold tracking-wide">
          ⚠ テストモード ON：リロード毎に取引・固定費を自動削除します
        </div>
      )}
      {showMixWarn && (
        <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <span className="flex-1">
            利用日と引落日が混在している可能性があります。
            「明細」タブで日付を確認してください（v0.3.0 マイグレーション）。
          </span>
          <button
            onClick={dismissMixWarn}
            className="text-amber-700 hover:text-amber-900"
            aria-label="閉じる"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md lg:max-w-6xl bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around py-2 z-50">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] sm:text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-gray-400'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
