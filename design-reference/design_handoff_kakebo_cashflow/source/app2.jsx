// app2.jsx — Cashflow Calendar リデザイン版

const { useState, useMemo } = React;

const D2_TWEAKS = /*EDITMODE-BEGIN*/{
  "month": 4,
  "showBalance": true,
  "visibleCards": 6
}/*EDITMODE-END*/;

const D2 = {
  bg: '#f7f4ed',
  surface: '#ffffff',
  ink: '#1a1410',
  inkSoft: '#7a6d5e',
  inkFaint: '#c9beac',
  rule: '#e7decd',
  ruleSoft: '#f0e8d8',
  bronze: '#b87333',
  good: '#3d6e4a',
  warn: '#9d3a4a',
};

// 月内の各日のイベント（給料、引落、今日）
function buildCalendar(year, monthIdx, today) {
  const firstDay = new Date(year, monthIdx, 1);
  const lastDay = new Date(year, monthIdx + 1, 0);
  const days = [];
  // 前月パディング
  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, monthIdx, -firstDay.getDay() + i + 1);
    days.push({ date: d, outOfMonth: true });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, monthIdx, d), outOfMonth: false });
  }
  // 後月パディング (6行になるよう)
  while (days.length < 42) {
    const last = days[days.length - 1].date;
    const next = new Date(last); next.setDate(last.getDate() + 1);
    days.push({ date: next, outOfMonth: true });
  }
  // イベント割り当て
  days.forEach(d => {
    d.isToday = d.date.toDateString() === today.toDateString();
    d.isPast = d.date < today;
    d.events = [];
    // 給料日
    if (d.date.getDate() === 25 && !d.outOfMonth) {
      d.events.push({ type: 'salary', amount: 500000, label: '給料' });
    }
    // 各カードの引落
    KAKEBO_DATA.cards.forEach(card => {
      const cycles = getCycles(card, KAKEBO_RANGE);
      cycles.forEach(c => {
        if (c.pay.toDateString() === d.date.toDateString()) {
          // 締め時点の取引（今日以降は計上しない）
          const txs = cycleTransactions(c, KAKEBO_DATA.transactions)
            .filter(t => parseDate(t.date) <= today);
          const sum = txs.reduce((s, t) => s + t.amount, 0);
          if (c.close < today && sum > 0) {
            d.events.push({ type: 'pay', card, sum, cycle: c });
          }
        }
      });
    });
  });
  return days;
}

// 月内残高推移を計算（前月末残高ベース）
function buildBalance(days, startBalance) {
  let bal = startBalance;
  return days.map(d => {
    if (!d.outOfMonth) {
      d.events.forEach(e => {
        if (e.type === 'salary') bal += e.amount;
        if (e.type === 'pay') bal -= e.sum;
      });
    }
    return { date: d.date, balance: bal, outOfMonth: d.outOfMonth };
  });
}

function CalendarCell({ day, balanceData, onSelect, selected }) {
  const dow = day.date.getDay();
  const hasEvent = day.events.length > 0;
  const payEvents = day.events.filter(e => e.type === 'pay');
  const salaryEvent = day.events.find(e => e.type === 'salary');

  return (
    <div
      onClick={() => hasEvent && onSelect(day)}
      style={{
        position: 'relative',
        background: D2.surface,
        borderRight: `1px solid ${D2.ruleSoft}`,
        borderBottom: `1px solid ${D2.ruleSoft}`,
        padding: '6px 7px 4px',
        minHeight: 76,
        opacity: day.outOfMonth ? 0.32 : 1,
        cursor: hasEvent ? 'pointer' : 'default',
        outline: selected ? `2px solid ${D2.bronze}` : 'none',
        outlineOffset: -2,
        transition: 'background .12s',
      }}>
      {/* 日付 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: dow === 0 ? D2.warn : (dow === 6 ? '#3a6989' : D2.ink),
          fontFamily: 'JetBrains Mono, monospace',
          background: day.isToday ? D2.bronze : 'transparent',
          color2: day.isToday ? D2.surface : undefined,
          ...(day.isToday && {
            color: D2.surface, background: D2.bronze,
            padding: '1px 5px', borderRadius: 3,
          }),
        }}>{day.date.getDate()}</span>
        {day.isToday && (
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                         color: D2.bronze }}>TODAY</span>
        )}
      </div>
      {/* 給料 */}
      {salaryEvent && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: D2.good,
          background: '#e6efe8', padding: '2px 5px', borderRadius: 3,
          fontFamily: 'JetBrains Mono, monospace', marginBottom: 3,
          letterSpacing: '-0.01em',
        }}>+{fmtYenK(salaryEvent.amount)}</div>
      )}
      {/* 引落 */}
      {payEvents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {payEvents.slice(0, 3).map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600,
              fontFamily: 'JetBrains Mono, monospace',
              color: e.card.color,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: e.card.color, flexShrink: 0,
              }} />
              <span>−{fmtYenK(e.sum)}</span>
            </div>
          ))}
          {payEvents.length > 3 && (
            <div style={{ fontSize: 9, color: D2.inkSoft }}>+ {payEvents.length - 3}</div>
          )}
        </div>
      )}
      {/* 残高（控えめに） */}
      {!day.outOfMonth && balanceData && (hasEvent || day.isToday) && (
        <div style={{
          position: 'absolute', bottom: 4, right: 6,
          fontSize: 8.5, color: D2.inkFaint, fontWeight: 500,
          fontFamily: 'JetBrains Mono, monospace',
        }}>{fmtYenK(balanceData.balance)}</div>
      )}
    </div>
  );
}

function CalendarGrid({ days, balanceMap, onSelect, selected }) {
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  return (
    <div style={{
      border: `1px solid ${D2.rule}`, borderRadius: 6, overflow: 'hidden',
      background: D2.ruleSoft,
    }}>
      {/* 曜日ヘッダー */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        background: D2.surface, borderBottom: `1px solid ${D2.rule}`,
      }}>
        {dows.map((d, i) => (
          <div key={i} style={{
            padding: '8px 8px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: i === 0 ? D2.warn : (i === 6 ? '#3a6989' : D2.inkSoft),
            borderRight: i < 6 ? `1px solid ${D2.ruleSoft}` : 'none',
          }}>{d}</div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
      }}>
        {days.map((d, i) => (
          <CalendarCell key={i} day={d}
                          balanceData={balanceMap.get(d.date.toDateString())}
                          onSelect={onSelect}
                          selected={selected && selected.date.toDateString() === d.date.toDateString()} />
        ))}
      </div>
    </div>
  );
}

// 確定済請求カード（右ペイン）
function PendingBillCard({ cycle, card, today }) {
  const txs = cycleTransactions(cycle, KAKEBO_DATA.transactions)
    .filter(t => parseDate(t.date) <= today);
  const sum = txs.reduce((s, t) => s + t.amount, 0);
  const total = (cycle.pay - cycle.close) / 86400000;
  const elapsed = Math.max(0, Math.min(total, (today - cycle.close) / 86400000));
  const progress = total > 0 ? elapsed / total : 1;
  const daysLeft = Math.ceil((cycle.pay - today) / 86400000);

  return (
    <div style={{
      background: D2.surface, borderRadius: 6,
      border: `1px solid ${D2.rule}`,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 17, borderRadius: 3, background: card.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 800, color: D2.surface,
            letterSpacing: '0.05em',
          }}>{card.brand}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: D2.ink,
                          letterSpacing: '-0.01em' }}>{card.name}</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: daysLeft <= 7 ? D2.warn : D2.inkSoft,
          textTransform: 'uppercase',
        }}>あと{daysLeft}日</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: D2.ink,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
        }}>{fmtYen(sum)}</span>
        <span style={{
          fontSize: 10, color: D2.inkSoft, fontFamily: 'JetBrains Mono, monospace',
        }}>{txs.length}件</span>
      </div>
      {/* ミニタイムライン（締め→引落） */}
      <div>
        <div style={{
          position: 'relative', height: 4, background: D2.ruleSoft, borderRadius: 999,
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${progress * 100}%`,
            background: card.color, borderRadius: 999,
          }} />
          <div style={{
            position: 'absolute', left: `${progress * 100}%`, top: -3,
            width: 10, height: 10, borderRadius: '50%',
            background: card.color, transform: 'translateX(-50%)',
            border: `2px solid ${D2.surface}`,
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 6,
          fontSize: 9.5, color: D2.inkSoft,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span>締 {fmtMD(cycle.close)}</span>
          <span style={{ color: card.color, fontWeight: 700 }}>引落 {fmtMD(cycle.pay)}</span>
        </div>
      </div>
    </div>
  );
}

// カード使用率
function CardUsageBar({ card, today }) {
  // 直近の進行中サイクル
  const cycles = getCycles(card, KAKEBO_RANGE);
  const open = cycles.find(c => c.start <= today && c.close >= today);
  if (!open) return null;
  const txs = cycleTransactions(open, KAKEBO_DATA.transactions)
    .filter(t => parseDate(t.date) <= today);
  const sum = txs.reduce((s, t) => s + t.amount, 0);
  const limit = card.id === 'saison' ? 800000 : 500000;
  const pct = Math.min(1, sum / limit);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                   padding: '8px 0', borderBottom: `1px solid ${D2.ruleSoft}` }}>
      <div style={{
        width: 22, height: 14, borderRadius: 2, background: card.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, fontWeight: 800, color: D2.surface,
        letterSpacing: '0.05em', flexShrink: 0,
      }}>{card.brand}</div>
      <span style={{ fontSize: 11, fontWeight: 600, color: D2.ink,
                      width: 78, flexShrink: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.name}
      </span>
      <div style={{ flex: 1, height: 5, background: D2.ruleSoft, borderRadius: 999, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct * 100}%`, background: card.color, borderRadius: 999,
        }} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: D2.ink, width: 80, textAlign: 'right',
        fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
      }}>{fmtYenK(sum)} / {fmtYenK(limit)}</span>
    </div>
  );
}

function App2() {
  const [tweaks, setTweak] = useTweaks(D2_TWEAKS);
  const [selectedDay, setSelectedDay] = useState(null);
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'amount'
  const today = KAKEBO_RANGE.today;
  const year = today.getFullYear();
  const monthIdx = tweaks.month;

  const days = useMemo(() => buildCalendar(year, monthIdx, today), [year, monthIdx, today]);
  const startBalance = 1432820;
  const balance = useMemo(() => buildBalance(days, startBalance), [days]);
  const balanceMap = useMemo(() => {
    const m = new Map();
    balance.forEach(b => m.set(b.date.toDateString(), b));
    return m;
  }, [balance]);
  const todayBalance = balanceMap.get(today.toDateString())?.balance || startBalance;

  // 確定済（待機中）の請求すべて
  const pendingBills = [];
  KAKEBO_DATA.cards.slice(0, tweaks.visibleCards).forEach(card => {
    getCycles(card, KAKEBO_RANGE).forEach(c => {
      if (c.close < today && c.pay >= today) {
        const txs = cycleTransactions(c, KAKEBO_DATA.transactions)
          .filter(t => parseDate(t.date) <= today);
        if (txs.reduce((s, t) => s + t.amount, 0) > 0) {
          pendingBills.push({ cycle: c, card });
        }
      }
    });
  });
  pendingBills.forEach(b => {
    b._sum = cycleTransactions(b.cycle, KAKEBO_DATA.transactions)
      .filter(t => parseDate(t.date) <= today)
      .reduce((s, t) => s + t.amount, 0);
  });
  if (sortBy === 'amount') {
    pendingBills.sort((a, b) => b._sum - a._sum);
  } else {
    pendingBills.sort((a, b) => a.cycle.pay - b.cycle.pay);
  }
  const pendingTotal = pendingBills.reduce((s, b) => {
    const txs = cycleTransactions(b.cycle, KAKEBO_DATA.transactions)
      .filter(t => parseDate(t.date) <= today);
    return s + txs.reduce((ss, t) => ss + t.amount, 0);
  }, 0);
  const nextBill = pendingBills[0];
  const nextBillSum = nextBill ?
    cycleTransactions(nextBill.cycle, KAKEBO_DATA.transactions)
      .filter(t => parseDate(t.date) <= today)
      .reduce((s, t) => s + t.amount, 0) : 0;

  // 月末の予測残高
  const monthEnd = balance.filter(b => !b.outOfMonth).slice(-1)[0]?.balance;

  return (
    <div style={{
      width: '100%', height: '100vh', background: D2.bg, color: D2.ink,
      fontFamily: '"Inter", system-ui, sans-serif',
      display: 'grid',
      gridTemplateColumns: '300px 1fr 340px',
      gridTemplateRows: 'auto 1fr auto',
      gap: 0,
      overflow: 'hidden',
    }}>
      {/* ─── ヘッダー（全幅） ─── */}
      <div style={{
        gridColumn: '1 / -1', padding: '18px 28px',
        background: D2.surface, borderBottom: `1px solid ${D2.rule}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            家計簿 / Cashflow
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, margin: '2px 0 0',
            letterSpacing: '-0.02em',
          }}>{year}年 {monthIdx + 1}月</h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setTweak('month', Math.max(0, monthIdx - 1))} style={btnStyle()}>‹</button>
          <button onClick={() => setTweak('month', today.getMonth())} style={btnStyle('primary')}>今月</button>
          <button onClick={() => setTweak('month', Math.min(11, monthIdx + 1))} style={btnStyle()}>›</button>
        </div>
      </div>

      {/* ─── 左: サマリー ─── */}
      <aside style={{
        background: D2.surface, borderRight: `1px solid ${D2.rule}`,
        padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22,
        overflow: 'auto',
      }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            今日の口座残高
          </div>
          <div style={{
            fontSize: 36, fontWeight: 700, color: D2.ink,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
            marginTop: 4, lineHeight: 1.1,
          }}>{fmtYen(todayBalance)}</div>
          <div style={{ fontSize: 10, color: D2.inkSoft, marginTop: 4 }}>
            {fmtMDDow(today)} 時点
          </div>
        </div>

        <div style={{ height: 1, background: D2.rule }} />

        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            次の引落
          </div>
          {nextBill ? (
            <>
              <div style={{
                fontSize: 26, fontWeight: 700, color: nextBill.card.color,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                marginTop: 4,
              }}>{fmtYen(nextBillSum)}</div>
              <div style={{ fontSize: 11, color: D2.inkSoft, marginTop: 4,
                             fontFamily: 'JetBrains Mono, monospace' }}>
                {fmtMDDow(nextBill.cycle.pay)} · {nextBill.card.name}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: D2.inkSoft, marginTop: 8 }}>—</div>
          )}
        </div>

        <div style={{ height: 1, background: D2.rule }} />

        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            確定済 · 引落待ち合計
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: D2.warn,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            marginTop: 4,
          }}>{fmtYen(pendingTotal)}</div>
          <div style={{ fontSize: 10, color: D2.inkSoft, marginTop: 2 }}>
            {pendingBills.length}件 · 締め済 / 未引落
          </div>
        </div>

        <div style={{ height: 1, background: D2.rule }} />

        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            月末予測残高
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700,
            color: monthEnd > 600000 ? D2.good : D2.warn,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            marginTop: 4,
          }}>{fmtYen(monthEnd || 0)}</div>
          {/* 内訳: 今日の残高 − 引落待ち + 給料 = 月末予測 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto',
            gap: '4px 10px', marginTop: 10,
            fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
            color: D2.inkSoft, alignItems: 'baseline',
          }}>
            <span>今日の残高</span>
            <span style={{ borderBottom: `1px dotted ${D2.rule}`, height: 1, alignSelf: 'end', marginBottom: 4 }} />
            <span style={{ color: D2.ink, fontWeight: 600 }}>{fmtYen(todayBalance)}</span>

            <span>確定済引落</span>
            <span style={{ borderBottom: `1px dotted ${D2.rule}`, height: 1, alignSelf: 'end', marginBottom: 4 }} />
            <span style={{ color: D2.warn, fontWeight: 600 }}>−{fmtYen(pendingTotal)}</span>

            {(() => {
              // 今日以降の給料
              const futureSalary = days
                .filter(d => !d.outOfMonth && d.date >= today)
                .reduce((s, d) => s + (d.events.find(e => e.type === 'salary')?.amount || 0), 0);
              if (futureSalary === 0) return null;
              return (
                <>
                  <span>予定給料</span>
                  <span style={{ borderBottom: `1px dotted ${D2.rule}`, height: 1, alignSelf: 'end', marginBottom: 4 }} />
                  <span style={{ color: D2.good, fontWeight: 600 }}>+{fmtYen(futureSalary)}</span>
                </>
              );
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                         paddingTop: 8, borderTop: `1px solid ${D2.ruleSoft}` }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: monthEnd > 600000 ? D2.good : D2.warn,
            }} />
            <span style={{ fontSize: 10, color: D2.inkSoft }}>
              {monthEnd > 600000 ? '安全圏' : '警戒域 — 60万以下'}
            </span>
          </div>
        </div>
      </aside>

      {/* ─── 中央: カレンダー ─── */}
      <main style={{
        padding: '20px 22px', overflow: 'auto',
        background: D2.bg,
      }}>
        <CalendarGrid days={days} balanceMap={balanceMap}
                       onSelect={setSelectedDay} selected={selectedDay} />

        {/* 今月の利用状況 — 進行中サイクル（次回引落分）の利用額 vs 利用枠 */}
        <div style={{
          marginTop: 22, background: D2.surface,
          border: `1px solid ${D2.rule}`, borderRadius: 6,
          padding: '14px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline',
                         justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                           color: D2.inkSoft, textTransform: 'uppercase' }}>
              今月の利用状況
            </div>
            <div style={{ fontSize: 9.5, color: D2.inkFaint }}>
              現サイクルの利用額 / 利用枠
            </div>
          </div>
          {KAKEBO_DATA.cards.slice(0, tweaks.visibleCards).map(card => (
            <CardUsageBar key={card.id} card={card} today={today} />
          ))}
        </div>
      </main>

      {/* ─── 右: 確定済請求リスト ─── */}
      <aside style={{
        background: D2.surface, borderLeft: `1px solid ${D2.rule}`,
        padding: '20px 22px', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                         color: D2.inkSoft, textTransform: 'uppercase' }}>
            引落待ち {pendingBills.length}件
          </div>
          {/* 並び替えセグメント */}
          <div style={{
            display: 'inline-flex', background: D2.ruleSoft, borderRadius: 4,
            padding: 2, fontSize: 10, fontWeight: 600,
          }}>
            {[
              { id: 'date', label: '日付順' },
              { id: 'amount', label: '金額順' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setSortBy(opt.id)} style={{
                appearance: 'none', border: 'none',
                background: sortBy === opt.id ? D2.surface : 'transparent',
                color: sortBy === opt.id ? D2.ink : D2.inkSoft,
                padding: '4px 9px', borderRadius: 3,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                boxShadow: sortBy === opt.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>{opt.label}</button>
            ))}
          </div>
        </div>
        {pendingBills.length === 0 ? (
          <div style={{ fontSize: 12, color: D2.inkSoft, padding: '20px 0' }}>
            確定済の請求はありません
          </div>
        ) : pendingBills.map((b, i) => (
          <PendingBillCard key={i} cycle={b.cycle} card={b.card} today={today} />
        ))}
      </aside>

      <TweaksPanel title="Tweaks">
        <TweakSection label="表示" />
        <TweakSlider label="表示カード数" value={tweaks.visibleCards} min={2} max={6} step={1}
                     onChange={(v) => setTweak('visibleCards', v)} />
        <TweakToggle label="残高ライン" value={tweaks.showBalance}
                     onChange={(v) => setTweak('showBalance', v)} />
      </TweaksPanel>
    </div>
  );
}

function btnStyle(variant) {
  return {
    appearance: 'none', border: `1px solid ${variant === 'primary' ? D2.bronze : D2.rule}`,
    background: variant === 'primary' ? D2.bronze : D2.surface,
    color: variant === 'primary' ? D2.surface : D2.ink,
    padding: '6px 12px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
    minWidth: 36,
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App2 />);
