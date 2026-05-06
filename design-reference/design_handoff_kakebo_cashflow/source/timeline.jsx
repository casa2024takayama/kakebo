// timeline.jsx — カードレーン式タイムライン

const TL_COLORS = {
  bg: '#f5f1ea',
  surface: '#fffdf8',
  ink: '#2a2018',
  inkSoft: '#7a6d5e',
  inkFaint: '#b8ad9c',
  rule: '#e7decd',
  ruleSoft: '#f0e8d8',
  bronze: '#b87333',
  bronzeSoft: '#e8c8a8',
};

// ─────────────────────────────────────────────────────────
// 月境界＋日付ルーラー
function TimeRuler({ range, dayWidth, height = 36 }) {
  const months = [];
  let d = new Date(range.start); d.setDate(1);
  while (d <= range.end) { months.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
  const totalDays = (range.end - range.start) / 86400000;

  return (
    <div style={{ position: 'relative', height, width: totalDays * dayWidth }}>
      {months.map((m, i) => {
        const offset = (m - range.start) / 86400000 * dayWidth;
        const next = new Date(m); next.setMonth(next.getMonth() + 1);
        const w = ((Math.min(next, range.end) - m) / 86400000) * dayWidth;
        return (
          <div key={i} style={{
            position: 'absolute', left: offset, top: 0, height,
            borderLeft: i === 0 ? 'none' : `1px solid ${TL_COLORS.rule}`,
            width: w,
            display: 'flex', alignItems: 'center',
            paddingLeft: 10,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: TL_COLORS.ink,
              letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            }}>{m.getMonth() + 1}<span style={{
              fontSize: 9, fontWeight: 600, color: TL_COLORS.inkSoft, marginLeft: 2,
              letterSpacing: '0.05em', whiteSpace: 'nowrap',
            }}>月</span></span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 1サイクル（利用期間→締め→待機→引落）の描画
function CycleSegment({ cycle, card, range, dayWidth, today, onClick, selected }) {
  const totalDays = (range.end - range.start) / 86400000;
  const totalW = totalDays * dayWidth;
  const startX = Math.max(0, ((cycle.start - range.start) / 86400000) * dayWidth);
  const closeX = ((cycle.close - range.start) / 86400000) * dayWidth;
  const payX = ((cycle.pay - range.start) / 86400000) * dayWidth;

  // 範囲外は描画しない
  if (closeX < 0 || startX > totalW) return null;
  if (payX < -50) return null;

  // 状態判定:
  //   isPaid: 引落日が今日より前 → 引落済
  //   isConfirmed: 締め済かつ引落前 → 金額確定・待機中
  //   isOpen: 締め前（進行中） → 今日までの取引のみ
  //   isFuture: 開始前 → 未来のサイクル
  const isPaid = cycle.pay < today;
  const isConfirmed = cycle.close < today && cycle.pay >= today;
  const isOpen = cycle.start <= today && cycle.close >= today;
  const isFuture = cycle.start > today;

  // 今日を過ぎた取引は計上しない
  const allTxs = cycleTransactions(cycle, KAKEBO_DATA.transactions);
  const txs = allTxs.filter(t => parseDate(t.date) <= today);
  const sum = txs.reduce((s, t) => s + t.amount, 0);

  // 金額表示の可否: 締め済（確定）または引落済の場合のみ
  const showAmount = (isPaid || isConfirmed) && sum > 0;

  // 利用期間バー
  const usageW = closeX - startX;
  // 待機期間（締め→引落）
  const waitW = payX - closeX;

  return (
    <g onClick={() => onClick && onClick(cycle)} style={{ cursor: 'pointer' }}>
      {/* 利用期間バー本体 — 薄い下地として */}
      <defs>
        <linearGradient id={`grad-${card.id}-${cycle.start.getTime()}`}
                        x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={card.colorBg} stopOpacity="0.55" />
          <stop offset="100%" stopColor={card.colorBg} stopOpacity="0.95" />
        </linearGradient>
      </defs>
      {usageW > 0 && (
        <>
          <rect x={startX} y={6} width={usageW} height={32} rx={3}
                fill={isFuture ? TL_COLORS.ruleSoft : `url(#grad-${card.id}-${cycle.start.getTime()})`}
                stroke={selected ? card.color : (isFuture ? TL_COLORS.rule : card.colorMid)}
                strokeOpacity={selected ? 1 : (isFuture ? 1 : 0.4)}
                strokeWidth={selected ? 1.5 : 0.5}
                strokeDasharray={isFuture ? '3 3' : 'none'}
                opacity={isFuture ? 0.5 : 1} />
          {/* 進行中サイクルの「未確定」ハッチング — 今日以降の部分 */}
          {isOpen && (() => {
            const todayInBarX = ((today - range.start) / 86400000) * dayWidth;
            const futurePart = closeX - todayInBarX;
            if (futurePart <= 0) return null;
            return (
              <>
                <defs>
                  <pattern id={`hatch-${card.id}-${cycle.start.getTime()}`}
                           patternUnits="userSpaceOnUse" width="6" height="6"
                           patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6"
                          stroke={card.colorMid} strokeWidth="1" opacity="0.4" />
                  </pattern>
                </defs>
                <rect x={todayInBarX} y={6} width={futurePart} height={32} rx={0}
                      fill={`url(#hatch-${card.id}-${cycle.start.getTime()})`}
                      opacity="0.6" />
                <rect x={todayInBarX} y={6} width={futurePart} height={32}
                      fill={TL_COLORS.surface} opacity="0.35" />
              </>
            );
          })()}
          {/* 中央のベースライン */}
          {!isFuture && (
            <line x1={startX + 2} y1={22} x2={closeX - 2} y2={22}
                  stroke={card.colorMid} strokeWidth="0.5" opacity="0.5" />
          )}
          {/* バー左端のサマリー — 締め済のみ */}
          {showAmount && usageW > 60 && (
            <text x={startX + 6} y={15} fontSize="8.5" fontWeight="600"
                  fill={card.color} opacity="0.85"
                  fontFamily="JetBrains Mono, monospace"
                  letterSpacing="0.02em">
              {txs.length}件 · {fmtYenK(sum)}
            </text>
          )}
          {/* 進行中サイクルのラベル */}
          {isOpen && usageW > 60 && (
            <text x={startX + 6} y={15} fontSize="8.5" fontWeight="600"
                  fill={card.color} opacity="0.65"
                  fontFamily="JetBrains Mono, monospace">
              進行中 · {txs.length}件 / {fmtYenK(sum)}
            </text>
          )}
          {/* 未来のサイクルラベル */}
          {isFuture && usageW > 60 && (
            <text x={startX + usageW / 2} y={26} fontSize="8.5" fontWeight="500"
                  fill={TL_COLORS.inkSoft} opacity="0.7"
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace">
              未開始
            </text>
          )}
        </>
      )}
      {/* 取引ドット（バーの上、明確に見えるように） */}
      {txs.map((t, i) => {
        const td = parseDate(t.date);
        const tx = ((td - range.start) / 86400000) * dayWidth;
        const r = Math.min(6, Math.max(2, Math.sqrt(t.amount) / 70));
        return (
          <g key={i}>
            <circle cx={tx} cy={22} r={r + 1}
                    fill={TL_COLORS.surface} opacity="0.9" />
            <circle cx={tx} cy={22} r={r}
                    fill={card.color}>
              <title>{`${t.date} ${t.merchant} ${fmtYen(t.amount)}`}</title>
            </circle>
          </g>
        );
      })}

      {/* 締め日マーカー（バーの右端でくびれる） — 未来は淡く */}
      <g transform={`translate(${closeX}, 22)`}>
        <line x1="0" y1="-18" x2="0" y2="18" stroke={card.color}
              strokeWidth="1.5" strokeDasharray="2 2"
              opacity={cycle.close > today ? 0.25 : 0.5} />
        <circle cx="0" cy="0" r="4"
                fill={cycle.close > today ? TL_COLORS.surface : card.color}
                stroke={card.color} strokeWidth="1.2" />
        {cycle.close <= today && <circle cx="0" cy="0" r="2" fill={TL_COLORS.surface} />}
        <text x="0" y="-22" fontSize="8" fontWeight="700"
              fill={card.color}
              opacity={cycle.close > today ? 0.5 : 1}
              textAnchor="middle" letterSpacing="0.05em">締</text>
      </g>

      {/* 待機期間（締め→引落の点線） */}
      {waitW > 0 && (
        <line x1={closeX} y1={22} x2={payX} y2={22}
              stroke={card.color} strokeWidth="1" strokeDasharray="3 3"
              opacity="0.5" />
      )}

      {/* 引落マーカー — 状態に応じて変化 */}
      <g transform={`translate(${payX}, 22)`}>
        <circle cx="0" cy="0" r={isPaid ? 13 : 15}
                fill={TL_COLORS.surface} opacity="0.95" />
        <circle cx="0" cy="0" r={isPaid ? 11 : 13}
                fill={isPaid ? card.colorBg : (isConfirmed ? card.color : TL_COLORS.surface)}
                stroke={card.color}
                strokeWidth="1.5"
                strokeDasharray={isFuture ? '2 2' : 'none'}
                opacity={isPaid ? 0.6 : (isFuture ? 0.4 : 1)} />
        {isPaid && (
          <text x="0" y="3.5" fontSize="11" fontWeight="700"
                fill={card.color} textAnchor="middle">✓</text>
        )}
        {isConfirmed && (
          <text x="0" y="3.5" fontSize="10" fontWeight="800"
                fill="#fffdf8" textAnchor="middle"
                fontFamily="JetBrains Mono, monospace">¥</text>
        )}
        {!isPaid && !isConfirmed && (
          <text x="0" y="3.5" fontSize="10" fontWeight="600"
                fill={card.color}
                opacity={isFuture ? 0.4 : 0.7}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace">?</text>
        )}
      </g>

      {/* 引落金額ラベル — 締め済（確定）のみ */}
      {showAmount && (
        <text x={payX} y={42} fontSize="10" fontWeight="700"
              fill={card.color} fontFamily="JetBrains Mono, monospace"
              textAnchor="middle"
              letterSpacing="-0.02em"
              stroke={TL_COLORS.surface} strokeWidth="3" paintOrder="stroke">
          {fmtYenK(sum)}
        </text>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────
// 1カードのレーン
function CardLane({ card, range, dayWidth, today, onSelectCycle, selectedCycle, height }) {
  const cycles = getCycles(card, range);
  const totalDays = (range.end - range.start) / 86400000;
  const totalW = totalDays * dayWidth;

  return (
    <div style={{
      position: 'relative', height,
      borderTop: `1px solid ${TL_COLORS.ruleSoft}`,
    }}>
      {/* レーンラベル（左固定） */}
      <div style={{
        position: 'sticky', left: 0, zIndex: 4,
        width: 180, height,
        background: TL_COLORS.surface,
        borderRight: `1px solid ${TL_COLORS.rule}`,
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 18, borderRadius: 3,
            background: card.color, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 800, color: '#fffdf8',
            letterSpacing: '0.05em',
          }}>{card.brand}</div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: TL_COLORS.ink,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
          }}>{card.name}</div>
        </div>
        <div style={{
          fontSize: 9.5, color: TL_COLORS.inkSoft,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {card.cycleCloseDay === 'end' ? '月末' : `${card.cycleCloseDay}日`}締→{card.payOffsetMonths === 1 ? '翌月' : '翌々'}{card.payDay}日
        </div>
      </div>

      {/* SVGレーン本体（左ラベルの右に絶対配置） */}
      <svg width={totalW} height={height}
           style={{ position: 'absolute', left: 180, top: 0, display: 'block' }}>
        {cycles.map((c, i) => (
          <CycleSegment key={i} cycle={c} card={card} range={range} dayWidth={dayWidth}
                         today={today}
                         onClick={onSelectCycle}
                         selected={selectedCycle && selectedCycle.cardId === c.cardId &&
                                   selectedCycle.start.getTime() === c.start.getTime()} />
        ))}
      </svg>
    </div>
  );
}

Object.assign(window, {
  TL_COLORS, TimeRuler, CycleSegment, CardLane,
});
