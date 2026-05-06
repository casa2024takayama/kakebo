// app.jsx — メインアプリ（カードレーン式）

const { useState, useRef, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "laneHeight": 64,
  "dayWidth": 5,
  "visibleCards": 6
}/*EDITMODE-END*/;

function CycleDetailPanel({ cycle, onClose }) {
  if (!cycle) return null;
  const card = KAKEBO_DATA.cards.find(c => c.id === cycle.cardId);
  const txs = cycleTransactions(cycle, KAKEBO_DATA.transactions)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const sum = txs.reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
      background: TL_COLORS.surface,
      borderLeft: `1px solid ${TL_COLORS.rule}`,
      boxShadow: '-12px 0 36px rgba(80,60,30,0.08)',
      zIndex: 50, padding: '24px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 16,
      overflow: 'auto',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 22, borderRadius: 3, background: card.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 800, color: '#fffdf8', letterSpacing: '0.05em',
          }}>{card.brand}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TL_COLORS.ink }}>
            {card.name}
          </div>
        </div>
        <button onClick={onClose} style={{
          appearance: 'none', border: 'none', background: 'transparent',
          color: TL_COLORS.inkSoft, fontSize: 18, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* サイクル概要 */}
      <div style={{
        background: card.colorBg, padding: 14, borderRadius: 6,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      color: card.color, textTransform: 'uppercase', marginBottom: 6 }}>
          請求サイクル
        </div>
        <div style={{ fontSize: 12, color: TL_COLORS.ink, fontFamily: 'JetBrains Mono, monospace' }}>
          {fmtMD(cycle.start)} 〜 {fmtMD(cycle.close)} ({Math.round((cycle.close - cycle.start) / 86400000) + 1}日間 · {txs.length}件)
        </div>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginTop: 12, paddingTop: 12, borderTop: `1px solid ${card.color}30`,
        }}>
          <div>
            <div style={{ fontSize: 10, color: TL_COLORS.inkSoft, fontWeight: 600 }}>引落日</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: card.color,
                          fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
              {fmtMDDow(cycle.pay)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: TL_COLORS.inkSoft, fontWeight: 600 }}>合計</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color,
                          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2 }}>
              {fmtYen(sum)}
            </div>
          </div>
        </div>
      </div>

      {/* 取引リスト */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      color: TL_COLORS.inkSoft, textTransform: 'uppercase',
                      marginBottom: 10 }}>
          取引明細 · {txs.length}件
        </div>
        {txs.map((t, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '8px 0', fontSize: 12,
            borderBottom: i < txs.length - 1 ? `1px solid ${TL_COLORS.ruleSoft}` : 'none',
          }}>
            <div>
              <div style={{ color: TL_COLORS.ink, fontWeight: 500 }}>{t.merchant}</div>
              <div style={{ fontSize: 10, color: TL_COLORS.inkSoft,
                            fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                {fmtMD(parseDate(t.date))}
              </div>
            </div>
            <div style={{ color: TL_COLORS.ink, fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600 }}>
              {fmtYen(t.amount)}
            </div>
          </div>
        ))}
        {/* 合計検証行 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 10, paddingTop: 10,
          borderTop: `1.5px solid ${card.color}`,
          fontSize: 11, fontWeight: 700, color: card.color,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>明細合計</span>
          <span>{fmtYen(sum)}</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [hiddenCards, setHiddenCards] = useState({});
  const scrollRef = useRef(null);
  const range = KAKEBO_RANGE;
  const dayWidth = tweaks.dayWidth;
  const totalDays = (range.end - range.start) / 86400000;
  const totalW = totalDays * dayWidth;
  const todayX = (range.today - range.start) / 86400000 * dayWidth;

  const cards = KAKEBO_DATA.cards.slice(0, tweaks.visibleCards).filter(c => !hiddenCards[c.id]);

  // 全カードの「確定済かつ未引落」サイクルの合計（=今後確実に引かれる金額）
  const upcomingTotal = cards.reduce((sum, card) => {
    const cycles = getCycles(card, range);
    return sum + cycles
      .filter(c => c.close < range.today && c.pay >= range.today)
      .reduce((s, c) => s + cycleSum(c, KAKEBO_DATA.transactions), 0);
  }, 0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = todayX - 280;
    }
  }, []);

  const jumpToToday = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: todayX - 280, behavior: 'smooth' });
    }
  };

  return (
    <div style={{
      width: '100%', height: '100vh', background: TL_COLORS.bg, color: TL_COLORS.ink,
      fontFamily: '"Inter", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: '20px 28px 16px',
        background: TL_COLORS.surface,
        borderBottom: `1px solid ${TL_COLORS.rule}`,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 24,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                        color: TL_COLORS.inkSoft, textTransform: 'uppercase' }}>
            家計簿 / カードタイムライン
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, margin: '4px 0 0',
            letterSpacing: '-0.02em', color: TL_COLORS.ink,
            whiteSpace: 'nowrap',
          }}>{cards.length}枚のカード <span style={{
            fontSize: 14, fontWeight: 500, color: TL_COLORS.inkSoft,
            marginLeft: 10, letterSpacing: 0,
            fontFamily: 'JetBrains Mono, monospace',
          }}>{range.start.getMonth()+1}月 — {range.end.getMonth()+1}月</span></h1>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                          color: TL_COLORS.inkSoft, textTransform: 'uppercase' }}>
              確定済 · 引落予定
            </div>
            <div style={{
              fontSize: 22, fontWeight: 700, color: TL_COLORS.ink,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2,
            }}>{fmtYen(upcomingTotal)}</div>
          </div>
          <button onClick={jumpToToday} style={{
            appearance: 'none', border: 'none',
            background: TL_COLORS.bronze, color: '#fffdf8',
            padding: '8px 14px', borderRadius: 4,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
            height: 32,
          }}>今日 {fmtMD(range.today)} →</button>
        </div>
      </div>

      {/* カードフィルター */}
      <div style={{
        padding: '10px 28px', background: TL_COLORS.surface,
        borderBottom: `1px solid ${TL_COLORS.rule}`,
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                       color: TL_COLORS.inkSoft, textTransform: 'uppercase', marginRight: 8 }}>
          表示
        </span>
        {KAKEBO_DATA.cards.slice(0, tweaks.visibleCards).map(card => {
          const hidden = hiddenCards[card.id];
          return (
            <button key={card.id} onClick={() =>
              setHiddenCards(h => ({ ...h, [card.id]: !h[card.id] }))} style={{
              appearance: 'none', border: `1px solid ${hidden ? TL_COLORS.rule : card.color}`,
              background: hidden ? 'transparent' : card.color,
              color: hidden ? TL_COLORS.inkSoft : '#fffdf8',
              padding: '4px 10px', borderRadius: 999,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: hidden ? card.color : '#fffdf8',
              }} />
              {card.short}
            </button>
          );
        })}
      </div>

      {/* タイムライン */}
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', position: 'relative',
        background: TL_COLORS.bg,
      }}>
        <div style={{ display: 'flex', minWidth: 180 + totalW }}>
          {/* 左: ラベル列ヘッダー */}
          <div style={{
            position: 'sticky', left: 0, top: 0, zIndex: 5,
            width: 180, background: TL_COLORS.surface,
            borderRight: `1px solid ${TL_COLORS.rule}`,
            borderBottom: `1px solid ${TL_COLORS.rule}`,
            height: 36, padding: '0 14px',
            display: 'flex', alignItems: 'center',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: TL_COLORS.inkSoft, textTransform: 'uppercase',
          }}>カード</div>

          {/* 右: ルーラー */}
          <div style={{
            position: 'relative', borderBottom: `1px solid ${TL_COLORS.rule}`,
            background: TL_COLORS.surface,
          }}>
            <TimeRuler range={range} dayWidth={dayWidth} />
          </div>
        </div>

        {/* 各カードレーン */}
        <div style={{ position: 'relative' }}>
          {/* 今日ライン（全レーン共通の縦線）— レーンより背面、引落マーカーより背面 */}
          <div style={{
            position: 'absolute', left: 180 + todayX, top: 0,
            width: 1.5, height: cards.length * tweaks.laneHeight,
            background: TL_COLORS.bronze, opacity: 0.4,
            zIndex: 1, pointerEvents: 'none',
            boxShadow: `0 0 0 3px ${TL_COLORS.bronze}10`,
          }} />
          {cards.map(card => (
            <CardLane key={card.id} card={card} range={range} dayWidth={dayWidth}
                       today={range.today}
                       onSelectCycle={setSelectedCycle}
                       selectedCycle={selectedCycle}
                       height={tweaks.laneHeight} />
          ))}
        </div>
      </div>

      {/* 凡例（フッター） */}
      <div style={{
        padding: '10px 28px', background: TL_COLORS.surface,
        borderTop: `1px solid ${TL_COLORS.rule}`,
        display: 'flex', alignItems: 'center', gap: 22,
        fontSize: 10, color: TL_COLORS.inkSoft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 22, height: 6, borderRadius: 2,
                          background: 'linear-gradient(90deg, #d8d2c4, #7a6d5e)' }} />
          <span>利用期間</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%',
                          background: TL_COLORS.ink, opacity: 0.85 }} />
          <span>取引</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 18,
                          borderTop: `1.5px dashed ${TL_COLORS.ink}` }} />
          <span>締め → 引落（待機）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%',
                          background: TL_COLORS.ink, color: '#fffdf8',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700,
                          fontFamily: 'JetBrains Mono, monospace' }}>¥</span>
          <span>引落予定</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%',
                          background: '#e7decd', color: TL_COLORS.inkSoft,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700 }}>✓</span>
          <span>引落済</span>
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9 }}>
          v0.5 · {fmtMD(range.today)} 23:52
        </div>
      </div>

      <CycleDetailPanel cycle={selectedCycle} onClose={() => setSelectedCycle(null)} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="レイアウト" />
        <TweakSlider label="表示カード数" value={tweaks.visibleCards} min={2} max={6} step={1}
                     onChange={(v) => setTweak('visibleCards', v)} />
        <TweakSlider label="レーン高" value={tweaks.laneHeight} min={48} max={96} step={4} unit="px"
                     onChange={(v) => setTweak('laneHeight', v)} />
        <TweakSlider label="日幅" value={tweaks.dayWidth} min={3} max={14} step={1} unit="px"
                     onChange={(v) => setTweak('dayWidth', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
