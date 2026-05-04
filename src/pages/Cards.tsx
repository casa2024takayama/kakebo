import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Pencil, Check, X, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { BillingGroup, Card, DaySpec } from '../types'
import { CARD_MASTERS } from '../lib/cardMasters'

function daySpecToInput(d: DaySpec): string {
  return d === 'last' ? 'last' : String(d)
}

function inputToDaySpec(s: string): DaySpec {
  if (s === 'last') return 'last'
  const n = parseInt(s, 10)
  if (Number.isFinite(n) && n >= 1 && n <= 31) return n
  return 1
}

function GroupHeader({ group }: { group: BillingGroup }) {
  const { upsertBillingGroup, deleteBillingGroup, cards } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [closing, setClosing] = useState(daySpecToInput(group.closingDay))
  const [withdraw, setWithdraw] = useState(daySpecToInput(group.withdrawalDay))
  const [account, setAccount] = useState(group.withdrawalAccount ?? '')

  const groupCardCount = cards.filter((c) => c.billingGroupId === group.id).length

  const save = () => {
    if (!name.trim()) return
    upsertBillingGroup({
      ...group,
      name: name.trim(),
      closingDay: inputToDaySpec(closing),
      withdrawalDay: inputToDaySpec(withdraw),
      withdrawalAccount: account || undefined,
    })
    setEditing(false)
  }

  const handleDelete = () => {
    const msg =
      groupCardCount > 0
        ? `${group.name} を削除しますか？\n紐付くカード ${groupCardCount}枚 も同時に削除されます。`
        : `${group.name} を削除しますか？`
    if (confirm(msg)) deleteBillingGroup(group.id)
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{group.name}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{groupCardCount}枚</span>
            <button onClick={() => setEditing(true)} className="text-gray-500">
              <Pencil size={14} />
            </button>
            <button onClick={handleDelete} className="text-danger">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {group.closingDay === 'last' ? '末日' : `${group.closingDay}日`}締め /
          翌月{group.withdrawalDay === 'last' ? '末日' : `${group.withdrawalDay}日`}引落
          {group.withdrawalAccount ? ` / ${group.withdrawalAccount}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 bg-gray-50 rounded-lg p-3">
      <label className="text-xs text-gray-600 block">
        グループ名
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
        />
      </label>
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
        <Plus size={14} /> このグループにカードを追加
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

function MasterPickerModal({
  onClose,
}: {
  onClose: () => void
}) {
  const { addBillingGroup, addCard } = useStore()

  const handlePick = (idx: number) => {
    const m = CARD_MASTERS[idx]
    const groupId = addBillingGroup({
      name: m.name,
      closingDay: m.closingDay,
      withdrawalDay: m.withdrawalDay,
    })
    addCard({ name: m.name, billingGroupId: groupId })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold">カードマスタから追加</h3>
          <button onClick={onClose} className="text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="p-3 space-y-2">
          {CARD_MASTERS.map((m, i) => (
            <button
              key={i}
              onClick={() => handlePick(i)}
              className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{m.name}</span>
                <span className="text-xs text-gray-400">{m.issuer}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {m.closingDay === 'last' ? '末日' : `${m.closingDay}日`}締め /
                翌月{m.withdrawalDay === 'last' ? '末日' : `${m.withdrawalDay}日`}引落
                {m.notes ? ` · ${m.notes}` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NewGroupForm({ onDone }: { onDone: () => void }) {
  const addBillingGroup = useStore((s) => s.addBillingGroup)
  const [name, setName] = useState('')
  const [closing, setClosing] = useState('15')
  const [withdraw, setWithdraw] = useState('10')

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
      <h3 className="text-sm font-semibold">新しい請求グループ</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="グループ名"
        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          締め日
          <input
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          引落日
          <input
            value={withdraw}
            onChange={(e) => setWithdraw(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!name.trim()) return
            addBillingGroup({
              name: name.trim(),
              closingDay: inputToDaySpec(closing),
              withdrawalDay: inputToDaySpec(withdraw),
            })
            onDone()
          }}
          className="flex-1 bg-accent text-white rounded-md py-1.5 text-xs font-semibold"
        >
          作成
        </button>
        <button
          onClick={onDone}
          className="flex-1 border border-gray-300 rounded-md py-1.5 text-xs"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

export default function Cards() {
  const navigate = useNavigate()
  const { billingGroups, cards } = useStore()
  const [showMaster, setShowMaster] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">カード管理</h1>
        <p className="text-xs text-gray-500 mt-1">
          請求グループと所属カードを管理します。締め日・引落日もここで編集できます。
        </p>
      </div>

      <button
        onClick={() => navigate('/import')}
        className="w-full bg-amber-50 border border-amber-300 text-amber-800 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-100"
      >
        <Upload size={16} /> 明細をCSVから取り込む
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowMaster(true)}
          className="bg-accent text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
        >
          <Plus size={14} /> カードマスタから追加
        </button>
        <button
          onClick={() => setShowNewGroup((v) => !v)}
          className="border border-accent text-accent rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
        >
          <Plus size={14} /> 空のグループを作成
        </button>
      </div>

      {showNewGroup && <NewGroupForm onDone={() => setShowNewGroup(false)} />}

      {billingGroups.length === 0 && !showNewGroup && (
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">
            まだ請求グループがありません。
          </p>
          <p className="text-xs text-gray-400 mt-1">
            上のボタンからカードマスタを選んで追加できます。
          </p>
        </div>
      )}

      {billingGroups.map((group) => {
        const groupCards = cards.filter((c) => c.billingGroupId === group.id)
        return (
          <section key={group.id} className="bg-white rounded-2xl shadow-sm p-4">
            <GroupHeader group={group} />

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

      {showMaster && <MasterPickerModal onClose={() => setShowMaster(false)} />}
    </div>
  )
}
