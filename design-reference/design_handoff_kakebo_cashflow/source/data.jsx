// data.jsx — モックデータ（複数カード対応版）

const KAKEBO_DATA = {
  cards: [
    {
      id: 'saison',
      name: 'セゾンカード',
      short: 'SAISON',
      brand: 'VISA',
      color: '#2c5f8d',
      colorBg: '#e8eff5',
      colorMid: '#7fa2c2',
      cycleCloseDay: 10,   // 毎月10日締め
      payDay: 4,           // 翌月4日払い
      payOffsetMonths: 1,
    },
    {
      id: 'aeon',
      name: 'AEONカード',
      short: 'AEON',
      brand: 'MASTER',
      color: '#9d3a4a',
      colorBg: '#f3e3e6',
      colorMid: '#c47a85',
      cycleCloseDay: 10,
      payDay: 2,
      payOffsetMonths: 2,  // 翌々月2日
    },
    {
      id: 'rakuten',
      name: '楽天カード',
      short: 'RAKUTEN',
      brand: 'VISA',
      color: '#bf3a2f',
      colorBg: '#f5e2df',
      colorMid: '#d6857c',
      cycleCloseDay: 'end', // 月末締め
      payDay: 27,
      payOffsetMonths: 1,
    },
    {
      id: 'amex',
      name: 'AMEXゴールド',
      short: 'AMEX',
      brand: 'AMEX',
      color: '#3d6e4a',
      colorBg: '#e2ebe4',
      colorMid: '#85a892',
      cycleCloseDay: 5,
      payDay: 26,
      payOffsetMonths: 1,
    },
    {
      id: 'apple',
      name: 'Apple Card',
      short: 'APPLE',
      brand: 'MASTER',
      color: '#26252a',
      colorBg: '#e2e1e5',
      colorMid: '#82818a',
      cycleCloseDay: 'end',
      payDay: 10,
      payOffsetMonths: 1,
    },
    {
      id: 'jal',
      name: 'JALカード',
      short: 'JAL',
      brand: 'JCB',
      color: '#9b6a1f',
      colorBg: '#f1e8d3',
      colorMid: '#c4a36b',
      cycleCloseDay: 15,
      payDay: 10,
      payOffsetMonths: 1,
    },
  ],
  // 取引（カード使用）
  transactions: [
    // セゾン
    { card: 'saison', date: '2026-03-12', amount: 4280, merchant: 'マルエツ' },
    { card: 'saison', date: '2026-03-15', amount: 12400, merchant: 'Apple' },
    { card: 'saison', date: '2026-03-22', amount: 8900, merchant: '無印良品' },
    { card: 'saison', date: '2026-03-28', amount: 32400, merchant: 'Amazon' },
    { card: 'saison', date: '2026-04-02', amount: 6420, merchant: 'ENEOS' },
    { card: 'saison', date: '2026-04-05', amount: 18700, merchant: 'ヨドバシ' },
    { card: 'saison', date: '2026-04-09', amount: 22500, merchant: 'JR東日本' },
    { card: 'saison', date: '2026-04-15', amount: 14200, merchant: 'ANA' },
    { card: 'saison', date: '2026-04-22', amount: 7800, merchant: '楽天市場' },
    { card: 'saison', date: '2026-04-28', amount: 41000, merchant: '高島屋' },
    { card: 'saison', date: '2026-05-02', amount: 12500, merchant: 'ユニクロ' },
    { card: 'saison', date: '2026-05-08', amount: 4500, merchant: 'スタバ' },
    // AEON
    { card: 'aeon', date: '2026-03-14', amount: 6280, merchant: 'イオン' },
    { card: 'aeon', date: '2026-03-19', amount: 4200, merchant: 'マクドナルド' },
    { card: 'aeon', date: '2026-03-25', amount: 89000, merchant: 'ニトリ' },
    { card: 'aeon', date: '2026-03-30', amount: 32400, merchant: '電気代' },
    { card: 'aeon', date: '2026-04-05', amount: 12800, merchant: '水道代' },
    { card: 'aeon', date: '2026-04-12', amount: 8400, merchant: 'ガス代' },
    { card: 'aeon', date: '2026-04-18', amount: 18200, merchant: '通信費' },
    { card: 'aeon', date: '2026-04-25', amount: 95000, merchant: '保険' },
    { card: 'aeon', date: '2026-05-01', amount: 4800, merchant: 'イオン' },
    // 楽天
    { card: 'rakuten', date: '2026-03-08', amount: 18400, merchant: '楽天市場' },
    { card: 'rakuten', date: '2026-03-18', amount: 9200, merchant: '楽天Books' },
    { card: 'rakuten', date: '2026-03-28', amount: 24800, merchant: '楽天トラベル' },
    { card: 'rakuten', date: '2026-04-05', amount: 6400, merchant: '楽天市場' },
    { card: 'rakuten', date: '2026-04-15', amount: 12200, merchant: '楽天市場' },
    { card: 'rakuten', date: '2026-04-22', amount: 38000, merchant: '楽天モバイル' },
    { card: 'rakuten', date: '2026-04-28', amount: 8800, merchant: '楽天Books' },
    { card: 'rakuten', date: '2026-05-03', amount: 14200, merchant: '楽天市場' },
    // AMEX
    { card: 'amex', date: '2026-03-08', amount: 32000, merchant: 'ホテル' },
    { code: 'amex', card: 'amex', date: '2026-03-15', amount: 18000, merchant: 'レストラン' },
    { card: 'amex', date: '2026-03-22', amount: 8400, merchant: 'タクシー' },
    { card: 'amex', date: '2026-03-30', amount: 24500, merchant: 'ホテル' },
    { card: 'amex', date: '2026-04-08', amount: 38000, merchant: 'JAL' },
    { card: 'amex', date: '2026-04-15', amount: 12500, merchant: 'バー' },
    { card: 'amex', date: '2026-04-22', amount: 28000, merchant: 'ホテル' },
    { card: 'amex', date: '2026-05-01', amount: 8900, merchant: 'カフェ' },
    // Apple
    { card: 'apple', date: '2026-03-10', amount: 1480, merchant: 'iCloud' },
    { card: 'apple', date: '2026-03-15', amount: 980, merchant: 'Apple Music' },
    { card: 'apple', date: '2026-03-25', amount: 4800, merchant: 'App Store' },
    { card: 'apple', date: '2026-04-01', amount: 1480, merchant: 'iCloud' },
    { card: 'apple', date: '2026-04-15', amount: 980, merchant: 'Apple Music' },
    { card: 'apple', date: '2026-04-22', amount: 198000, merchant: 'iPhone Pro' },
    { card: 'apple', date: '2026-05-02', amount: 1480, merchant: 'iCloud' },
    // JAL
    { card: 'jal', date: '2026-03-13', amount: 48000, merchant: 'JAL国内線' },
    { card: 'jal', date: '2026-03-20', amount: 6800, merchant: 'ANA羽田' },
    { card: 'jal', date: '2026-04-02', amount: 124000, merchant: 'JAL国際線' },
    { card: 'jal', date: '2026-04-15', amount: 8400, merchant: 'ホテル' },
    { card: 'jal', date: '2026-04-25', amount: 14200, merchant: 'レンタカー' },
    { card: 'jal', date: '2026-05-05', amount: 18000, merchant: '空港ラウンジ' },
  ],
};

// 表示範囲: 2026-03-01 〜 2026-07-15
const KAKEBO_RANGE = {
  start: new Date(2026, 2, 1),
  end:   new Date(2026, 6, 15),
  today: new Date(2026, 4, 4), // 2026-05-04
};

const fmtYen = (n) => '¥' + n.toLocaleString('ja-JP');
const fmtYenK = (n) => {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万';
  return '¥' + n.toLocaleString('ja-JP');
};
const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const fmtMDDow = (d) => {
  const dow = ['日','月','火','水','木','金','土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
};
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// カードの請求サイクルを計算
// 各サイクル: { start, close, pay, cardId }
function getCycles(card, range) {
  const cycles = [];
  // 範囲開始の少し前から
  let cursor = new Date(range.start);
  cursor.setMonth(cursor.getMonth() - 2);
  cursor.setDate(1);
  const rangeEnd = new Date(range.end);
  rangeEnd.setMonth(rangeEnd.getMonth() + 2);

  while (cursor < rangeEnd) {
    const closeDay = card.cycleCloseDay === 'end'
      ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
      : card.cycleCloseDay;
    const closeDate = new Date(cursor.getFullYear(), cursor.getMonth(), closeDay);
    // 期間開始: 前回の締めの翌日
    const prevCloseDay = card.cycleCloseDay === 'end'
      ? new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate()
      : card.cycleCloseDay;
    const startDate = new Date(cursor.getFullYear(), cursor.getMonth() - 1, prevCloseDay + 1);
    // 引落日: closeDate + payOffsetMonths月後の payDay
    const payMonth = new Date(closeDate.getFullYear(), closeDate.getMonth() + card.payOffsetMonths, card.payDay);

    cycles.push({
      cardId: card.id,
      start: startDate,
      close: closeDate,
      pay: payMonth,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return cycles;
}

function cycleSum(cycle, transactions) {
  return transactions
    .filter(t => t.card === cycle.cardId)
    .filter(t => {
      const d = parseDate(t.date);
      return d >= cycle.start && d <= cycle.close;
    })
    .reduce((s, t) => s + t.amount, 0);
}

function cycleTransactions(cycle, transactions) {
  return transactions
    .filter(t => t.card === cycle.cardId)
    .filter(t => {
      const d = parseDate(t.date);
      return d >= cycle.start && d <= cycle.close;
    });
}

Object.assign(window, {
  KAKEBO_DATA, KAKEBO_RANGE,
  fmtYen, fmtYenK, fmtMD, fmtMDDow, parseDate,
  getCycles, cycleSum, cycleTransactions,
});
