import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useStore } from '../store'
import type { BillingGroup, Card, DaySpec } from '../types'

function daySpecToInput(d: DaySpec): string {
  return d === 'last' ? 'last' : String(d)
}

function inputToDaySpec(s: string): DaySpec {
  if (s === 'last') return 'last'
  const n = parseInt(s, 10)
  if (Number.isFinite(n) && n >= 1 && n <= 31) return n
  return 1
}

function GroupEditor({ group }: { group: BillingGroup }) {
  const upsert = useStore((s) => s.upsertBillingGroup)
  const [closing, setClosing] = useState(daySpecToInput(group.closingDay))
  const [withdraw, setWithdraw] = useState(daySpecToInput(group.withdrawalDay))
  const [account, setAccount] = useState(group.withdrawalAccount ?? '')
  const [editing, setEditing] = useState(false)

  const save = () => {
    upsert({
      ...group,
      closingDay: inputToDaySpec(closing),
      withdrawalDay: inputToDaySpec(withdraw),
      withdrawalAccount: account || undefined,
    })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
        <span>
          {group.closingDay === 'last' ? '末日' : `${group.closingDay}日`}締め /
          翌月{group.withdrawalDay === 'last' ? '末日' : `${group.withdrawalDay}日`}引落
          {group.withdrawalAccount ? ` / ${group.withdrawalAccount}` : ''}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-accent flex items-center gap-1"
        >
          <Pencil size={12} /> 編集
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          締め日
          <input
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
            placeholder="1〜31 or last"
            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          引落日（翌月）
          <input
            value={withdraw}
            onChange={(e) => setWithdraw(e.target.value)}
            placeholder="1〜31 or last"
            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
      </div>
      <label className="text-xs text-gray-600 block">
        引落口座（任意）
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="例: 三井住友 ****1234"
          className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={save}
          className="flex-1 bg-accent text-white rounded-md py-1.5 text-xs font-semibold flex items-center justify-center gap-1"
        >
          <Check size={14} /> 保存
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex-1 border border-gray-300 rounded-md py-1.5 text-xs flex items-center justify-center gap-1"
        >
          <X size={14} /> キャンセル
        </button>
      </div>
    </div>
  )
}

function CardRow({ card }: { card: Card }) {
  const { billingGroups, updateCard, deleteCard } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(card.name)
  const [groupId, setGroupId] = useState(card.billingGroupId)

  const save = () => {
    if (!name.trim()) return
    updateCard({ ...card, name: name.trim(), billingGroupId: groupId })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-gray-50 rounded-lg p-2 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
        />
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          {billingGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={save}
            className="flex-1 bg-accent text-white rounded-md py-1 text-xs font-semibold"
          >
            保存
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex-1 border border-gray-300 rounded-md py-1 text-xs"
          >
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <span className="text-sm">{card.name}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} className="text-gray-500">
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (confirm(`${card.name} を削除しますか？`)) deleteCard(card.id)
          }}
          className="text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function AddCardForm({ groupId }: { groupId: string }) {
  const addCard = useStore((s) => s.addCard)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-2 border border-dashed border-accent/40 text-accent rounded-lg py-2 text-xs flex items-center justify-center gap-1"
      >
        <Plus size={14} /> カードを追加
      </button>
    )
  }

  return (
    <div className="mt-2 flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="カード名（例: ニコスゴールド）"
        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
      />
      <button
        onClick={() => {
          if (!name.trim()) return
          addCard({ name: name.trim(), billingGroupId: groupId })
          setName('')
          setOpen(false)
        }}
        className="bg-accent text-white rounded-md px-3 text-xs font-semibold"
      >
        追加
      </button>
      <button
        onClick={() => {
          setName('')
          setOpen(false)
        }}
        className="border border-gray-300 rounded-md px-2 text-xs"
      >
        ✕
      </button>
    </div>
  )
}

export default function Cards() {
  const { billingGroups, cards } = useStore()

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">カード管理</h1>
        <p className="text-xs text-gray-500 mt-1">
          4つの請求グループにカードを紐付けます。締め日・引落日もここで編集できます。
        </p>
      </div>

      {billingGroups.map((group) => {
        const groupCards = cards.filter((c) => c.billingGroupId === group.id)
        return (
          <section
            key={group.id}
            className="bg-white rounded-2xl shadow-sm p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{group.name}</h2>
              <span className="text-xs text-gray-400">
                {groupCards.length}枚
              </span>
            </div>
            <GroupEditor group={group} />

            <div className="mt-3 space-y-1.5">
              {groupCards.length === 0 ? (
                <p className="text-xs text-gray-400">
                  まだカードが登録されていません。
                </p>
              ) : (
                groupCards.map((c) => <CardRow key={c.id} card={c} />)
              )}
            </div>

            <AddCardForm groupId={group.id} />
          </section>
        )
      })}
    </div>
  )
}
