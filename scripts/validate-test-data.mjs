import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

const targetArg = process.argv[2] || 'docs/test-data/kakebo_backup_dummy_v2.json'
const targetPath = path.resolve(process.cwd(), targetArg)

if (!fs.existsSync(targetPath)) {
  fail(`file not found: ${targetArg}`)
}

const raw = fs.readFileSync(targetPath, 'utf8')
let payload
try {
  payload = JSON.parse(raw)
} catch {
  fail('invalid JSON format')
}

if (payload.app !== 'kakebo') fail('payload.app must be "kakebo"')
if (typeof payload.version !== 'number') fail('payload.version must be a number')
if (!payload.data || typeof payload.data !== 'object') fail('payload.data is required')
if (!Array.isArray(payload.data.transactions)) fail('payload.data.transactions must be an array')

const transactions = payload.data.transactions

const duplicateByMAD = new Map()
for (const t of transactions) {
  const key = `${t.memo ?? ''}|${t.amount ?? ''}|${t.date ?? ''}`
  const arr = duplicateByMAD.get(key) ?? []
  arr.push(t.id ?? '(no-id)')
  duplicateByMAD.set(key, arr)
}

const duplicateEntries = [...duplicateByMAD.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => ({ key, ids }))

const includedForWithdrawal = transactions.filter(
  (t) => t.kind !== 'income' && t.excludeFromWithdrawal !== true,
)
const excludedRecordOnly = transactions.filter((t) => t.excludeFromWithdrawal === true)
const incomes = transactions.filter((t) => t.kind === 'income')

const withdrawalByDate = new Map()
for (const t of includedForWithdrawal) {
  const wd = t.actualWithdrawalDate || t.date
  withdrawalByDate.set(wd, (withdrawalByDate.get(wd) ?? 0) + Number(t.amount || 0))
}
const withdrawalRows = [...withdrawalByDate.entries()].sort((a, b) =>
  String(a[0]).localeCompare(String(b[0])),
)

const totalIncluded = includedForWithdrawal.reduce((s, t) => s + Number(t.amount || 0), 0)
const totalExcluded = excludedRecordOnly.reduce((s, t) => s + Number(t.amount || 0), 0)
const totalIncome = incomes.reduce((s, t) => s + Number(t.amount || 0), 0)

console.log(`File: ${targetArg}`)
console.log(`Transactions: ${transactions.length}`)
console.log(`Duplicate (memo+amount+date): ${duplicateEntries.length}`)
if (duplicateEntries.length > 0) {
  for (const dup of duplicateEntries) {
    console.log(`  - ${dup.key} -> ids: ${dup.ids.join(', ')}`)
  }
}
console.log(`Included for withdrawal calc: ${includedForWithdrawal.length}`)
console.log(`Record-only (excludeFromWithdrawal=true): ${excludedRecordOnly.length}`)
console.log(`Income entries: ${incomes.length}`)
console.log(`Total included withdrawal amount: ${totalIncluded}`)
console.log(`Total record-only amount: ${totalExcluded}`)
console.log(`Total income amount: ${totalIncome}`)
console.log('Withdrawal totals by date:')
for (const [date, amount] of withdrawalRows) {
  console.log(`  ${date}: ${amount}`)
}

if (duplicateEntries.length > 0) {
  process.exit(2)
}
