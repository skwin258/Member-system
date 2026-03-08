import { useEffect, useMemo, useState } from "react";
import "../App.css";

// ✅ 預設回到 3 個獎項（你要的原本那組）
const DEFAULT_PRIZES = [
  { name: "一獎", winners: 1 },
  { name: "二獎", winners: 2 },
  { name: "三獎", winners: 5 },
];

// （可選）預設總號碼數
const DEFAULT_TOTAL = 300;

export default function NumberLotteryPage({ me, onBack }) {
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES);
  const [totalCount, setTotalCount] = useState(DEFAULT_TOTAL);

  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!me?.user?.num_authorized) {
    return (
      <div className="lottery-center">
        <div className="lottery-card">
          <h2>❌ 未授權使用</h2>
          <button className="btn-main" onClick={onBack}>
            返回首頁
          </button>
        </div>
      </div>
    );
  }

  const totalWinners = useMemo(() => {
    return prizes.reduce((sum, p) => sum + (Number(p.winners) || 0), 0);
  }, [prizes]);

  function addPrize() {
    setPrizes([...prizes, { name: `${prizes.length + 1}獎`, winners: 1 }]);
  }

  function updatePrize(i, key, val) {
    const copy = [...prizes];
    copy[i][key] = val;
    setPrizes(copy);
  }

  function getStorageKey(N = totalCount, P = prizes) {
    const compact = P.map((p) => `${p.name}:${Number(p.winners) || 0}`).join("|");
    return `num_lottery_round_list_v1::N=${Number(N) || 0}::${compact}`;
  }

  function cryptoRandInt(maxExclusive) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }

  function shuffleInPlace(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = cryptoRandInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildRound(N, prizesConfig) {
    const W = prizesConfig.reduce((s, p) => s + (Number(p.winners) || 0), 0);

    if (!Number.isFinite(N) || N <= 0) throw new Error("總號碼數需大於 0");
    if (W <= 0) throw new Error("中獎人數總和需大於 0");
    if (W > N) throw new Error(`中獎總人數(${W})不能大於總號碼數(${N})`);

    const nums = Array.from({ length: N }, (_, i) => i + 1);
    shuffleInPlace(nums);

    const winners = nums.slice(0, W);

    const prizeWinners = [];
    let idx = 0;
    for (const p of prizesConfig) {
      const cnt = Number(p.winners) || 0;
      const picked = winners.slice(idx, idx + cnt);
      idx += cnt;
      prizeWinners.push({
        name: p.name,
        numbers: picked.sort((a, b) => a - b),
      });
    }

    return {
      totalCount: N,
      totalWinners: W,
      prizeWinners,
      createdAt: Date.now(),
    };
  }

  async function startDraw() {
    setLoading(true);
    try {
      const N = Number(totalCount);
      const W = totalWinners;

      if (!N || N <= 0) throw new Error("請先設定總號碼數");
      if (W > N) throw new Error(`中獎總人數(${W})不能大於總號碼數(${N})`);

      const data = buildRound(N, prizes);

      localStorage.setItem(getStorageKey(), JSON.stringify(data));
      setRound(data);
    } catch (e) {
      alert(e.message || "發生錯誤");
    }
    setLoading(false);
  }

  // ✅ 重置本輪：清抽獎結果 + 回到預設 3 獎項（可選：總號碼數也回預設）
  function resetRound() {
    // 1) 先把「目前這組設定」的 round 清掉
    localStorage.removeItem(getStorageKey());

    // 2) 也把「預設那組」可能存在的 round 清掉（避免回預設後直接又讀到舊的）
    localStorage.removeItem(getStorageKey(DEFAULT_TOTAL, DEFAULT_PRIZES));

    // 3) 清畫面結果
    setRound(null);

    // 4) ✅ 回到原本 3 個獎項
    setPrizes(DEFAULT_PRIZES);

    // 5) （可選）總號碼數也回預設
    setTotalCount(DEFAULT_TOTAL);
  }

  // 讀取目前設定對應的本輪（如果有）
  useEffect(() => {
    try {
      const cached = localStorage.getItem(getStorageKey());
      setRound(cached ? JSON.parse(cached) : null);
    } catch {
      setRound(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, prizes]);

  function renderNumbers(nums) {
    if (!nums || nums.length === 0) return "—";
    return nums.join(", ");
  }

  return (
    <div className="lottery-wrapper">
      <div className="lottery-header">
        <h1>🎲 數字抽獎控制台</h1>
        <button className="btn-ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <div className="lottery-grid">
        {/* 左：獎項設定 */}
        <div className="lottery-card">
          <h2>獎項設定</h2>

          <div className="prize-row">
            <input value="總號碼數" readOnly />
            <input
              type="number"
              value={totalCount}
              min={1}
              onChange={(e) => setTotalCount(Number(e.target.value))}
            />
            <span>個</span>
          </div>

          <div style={{ opacity: 0.8, fontSize: 13, margin: "8px 0 16px" }}>
            中獎總人數：<b>{totalWinners}</b>
          </div>

          {prizes.map((p, i) => (
            <div className="prize-row" key={i}>
              <input
                value={p.name}
                onChange={(e) => updatePrize(i, "name", e.target.value)}
              />
              <input
                type="number"
                value={p.winners}
                min={0}
                onChange={(e) => updatePrize(i, "winners", Number(e.target.value))}
              />
              <span>人</span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn-main" onClick={addPrize} style={{ flex: 1 }}>
              ＋ 新增獎項
            </button>
            <button className="btn-ghost" onClick={resetRound} style={{ flex: 1 }}>
              重置本輪
            </button>
          </div>

          {round && (
            <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13 }}>
              本輪已生成：共 <b>{round.totalCount}</b> 號　
              中獎 <b>{round.totalWinners}</b>
            </div>
          )}
        </div>

        {/* 右：開始抽獎 + 列出中獎名單 */}
        <div className="lottery-card center">
          <h2>開始抽獎</h2>

          <button
            className="btn-main big"
            onClick={startDraw}
            disabled={loading}
            style={{ width: 260 }}
          >
            {loading ? "抽獎中..." : "開始抽獎"}
          </button>

          {!round && (
            <div style={{ marginTop: 16, opacity: 0.7, fontSize: 13, lineHeight: 1.6 }}>
              按下開始抽獎後，系統會從 <b>1~{Number(totalCount) || 0}</b> 中
              抽出 <b>{totalWinners}</b> 個中獎號碼並自動列出。
            </div>
          )}

          {round && (
            <div className="result-box" style={{ width: "100%", textAlign: "left" }}>
              {round.prizeWinners.map((p, idx) => (
                <div key={idx} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    🎉 {p.name}（{p.numbers.length} 人）
                  </div>
                  <div style={{ opacity: 0.9, fontSize: 13, lineHeight: 1.6 }}>
                    {renderNumbers(p.numbers)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}