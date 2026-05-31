import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import "./mobileFootballPenalty.css";

const FALLBACK_BET_AMOUNT = 1000;

const FALLBACK_SHOT_CONFIG = [
  { ball_no: 1, title: "第一球", reward_s: 2000, probability: 50 },
  { ball_no: 2, title: "第二球", reward_s: 4000, probability: 50 },
  { ball_no: 3, title: "第三球", reward_s: 8000, probability: 30 },
  { ball_no: 4, title: "第四球", reward_s: 16000, probability: 10 },
  { ball_no: 5, title: "第五球", reward_s: 32000, probability: 1 },
];

const TEAMS = [
  { id: "taiwan", name: "台灣", code: "TW", logo: "/images/teams/taiwan.png" },
  { id: "arg", name: "阿根廷", code: "AR", logo: "/images/teams/argentina.png" },
  { id: "fra", name: "法國", code: "FR", logo: "/images/teams/france.png" },
  { id: "por", name: "葡萄牙", code: "PT", logo: "/images/teams/portugal.png" },
  { id: "bra", name: "巴西", code: "BR", logo: "/images/teams/brazil.png" },
  { id: "jpn", name: "日本", code: "JP", logo: "/images/teams/japan.png" },
  { id: "ger", name: "德國", code: "DE", logo: "/images/teams/germany.png" },
  { id: "esp", name: "西班牙", code: "ES", logo: "/images/teams/spain.png" },
  { id: "ita", name: "義大利", code: "IT", logo: "/images/teams/italy.png" },
  { id: "ned", name: "荷蘭", code: "NL", logo: "/images/teams/netherlands.png" },
];

const NET = {
  left: 1,
  top: 20,
  width: 98,
  height: 50,
  rows: 3,
  cols: 5,
};

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function rateText(rate) {
  const n = Number(rate || 0);
  if (n < 0.01) return `${n.toFixed(6).replace(/\.?0+$/, "")}%`;
  if (n < 1) return `${n.toFixed(4).replace(/\.?0+$/, "")}%`;
  return `${n.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function getRandomOpponent(teamId) {
  const pool = TEAMS.filter((t) => t.id !== teamId);
  return pool[Math.floor(Math.random() * pool.length)] || TEAMS[0];
}

function getGridPoint(row, col) {
  const x = NET.left + NET.width * ((col + 0.5) / NET.cols);
  const y = NET.top + NET.height * ((row + 0.5) / NET.rows);
  return { x, y };
}

function normalizePrizeList(list) {
  const arr = Array.isArray(list) && list.length ? list : FALLBACK_SHOT_CONFIG;

  return arr
    .map((p, idx) => ({
      ball_no: Number(p.ball_no || idx + 1),
      title: String(p.title || `第${idx + 1}球`),
      reward_s: Number(p.reward_s || 0),
      probability: Number(p.probability || 0),
    }))
    .sort((a, b) => Number(a.ball_no) - Number(b.ball_no))
    .slice(0, 5);
}

export default function MobileFootballPenaltyPage({
  me,
  activities,
  onRefreshMe,
  onTabChange,
  isGuest = false,
  onNeedLogin,
}) {
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [activityEnabled, setActivityEnabled] = useState(true);
  function getActivityEnabledFromProps(activities) {
  if (!activities) return true;

  if (Array.isArray(activities)) {
    const row = activities.find((x) => {
      const key = String(x?.key || x?.activity_key || "").trim();
      return key === "football";
    });

    if (!row) return true;

    return (
      Number(row.enabled ?? row.is_enabled ?? row.open ?? 0) === 1 ||
      String(row.enabled ?? row.is_enabled ?? row.open ?? "").trim() === "開啟"
    );
  }

  const row = activities.football || activities["football"];
  if (!row) return true;

  return (
    Number(row.enabled ?? row.is_enabled ?? row.open ?? 0) === 1 ||
    String(row.enabled ?? row.is_enabled ?? row.open ?? "").trim() === "開啟"
  );
}
  const [betAmount, setBetAmount] = useState(FALLBACK_BET_AMOUNT);
  const [prizes, setPrizes] = useState(FALLBACK_SHOT_CONFIG);
  const [sBalance, setSBalance] = useState(Number(me?.user?.s_balance || 0));

  const [screen, setScreen] = useState("intro");
  const [selectedTeam, setSelectedTeam] = useState(TEAMS[0]);
  const [opponentTeam, setOpponentTeam] = useState(getRandomOpponent(TEAMS[0].id));

  const [gameId, setGameId] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentShot, setCurrentShot] = useState(0);
  const [currentWin, setCurrentWin] = useState(0);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("點擊球網任一位置開始遊戲");

  const [ball, setBall] = useState({ x: 50, y: 82, active: false });
  const [keeperPos, setKeeperPos] = useState({ x: 50, y: 55, rotate: 0 });

  const [shooting, setShooting] = useState(false);
  const [resultLocked, setResultLocked] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const [cashAnimation, setCashAnimation] = useState({
    show: false,
    amount: 0,
    display: 0,
  });

  const resetTimerRef = useRef(null);
  const resultTimerRef = useRef(null);

  const nextPrize = prizes[currentShot] || null;

  const currentRateText = useMemo(() => {
    if (!nextPrize) return "已完成";
    return rateText(nextPrize.probability);
  }, [nextPrize]);

  useEffect(() => {
    setSBalance(Number(me?.user?.s_balance || 0));
  }, [me?.user?.s_balance]);

useEffect(() => {
  loadFootballConfig();
  return () => clearTimers();
}, []);

useEffect(() => {
  setActivityEnabled(getActivityEnabledFromProps(activities));
}, [activities]);

async function loadFootballConfig() {
  const propEnabled = getActivityEnabledFromProps(activities);
  setActivityEnabled(propEnabled);

  if (isGuest) return;

  try {
    setLoadingConfig(true);

    const res = await api.footballConfig({ force: true });

    if (!res?.success) {
      setActivityEnabled(propEnabled);
      return;
    }

    const apiEnabled = Number(res?.activity?.enabled || 0) === 1;

    setActivityEnabled(apiEnabled);
    setBetAmount(Number(res?.bet_amount || FALLBACK_BET_AMOUNT));
    setSBalance(Number(res?.s_balance || 0));
    setPrizes(normalizePrizeList(res?.prizes || []));
  } catch (_) {
    setActivityEnabled(propEnabled);
  } finally {
    setLoadingConfig(false);
  }
}

  function clearTimers() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }

  function resetVisualOnly() {
    setBall({ x: 50, y: 82, active: false });
    setKeeperPos({ x: 50, y: 55, rotate: 0 });
    setSelectedPoint(null);
    setShooting(false);
    setResultLocked(false);
  }

  function resetRound() {
    clearTimers();
    setGameId(0);
    setGameStarted(false);
    setCurrentShot(0);
    setCurrentWin(0);
    setStatus("idle");
    setMessage("點擊球網任一位置開始遊戲");
    resetVisualOnly();
  }

  function resetAfterGoal(nextShot, win) {
    resetTimerRef.current = setTimeout(() => {
      resetVisualOnly();

      if (nextShot >= 5) {
        setMessage(`已完成 5 球，可領取 ${money(win)} S幣`);
      } else {
        setMessage(`可繼續挑戰第 ${nextShot + 1} 球，或領取 ${money(win)} S幣`);
      }
    }, 1000);
  }

  function resetAfterSave() {
    resetTimerRef.current = setTimeout(() => {
      setGameId(0);
      setGameStarted(false);
      setCurrentShot(0);
      setCurrentWin(0);
      setStatus("idle");
      setMessage("點擊球網開始新局");
      resetVisualOnly();
      onRefreshMe?.({ silent: true, force: true });
      loadFootballConfig();
    }, 1000);
  }

  function goSelectTeam() {
    if (isGuest) {
      onNeedLogin?.();
      return;
    }

    if (!activityEnabled) {
      alert("足球射門活動尚未開放");
      return;
    }

    setScreen("team");
  }

  function confirmTeam() {
    if (!selectedTeam) return;
    setOpponentTeam(getRandomOpponent(selectedTeam.id));
    resetRound();
    setScreen("game");
  }

  async function startByFirstShot() {
    if (isGuest) {
      onNeedLogin?.();
      return null;
    }

    if (!activityEnabled) {
      alert("足球射門活動尚未開放");
      return null;
    }

    if (sBalance < betAmount) {
      alert("S幣不足，無法開始遊戲");
      return null;
    }

    const res = await api.footballStart();

    if (!res?.success) {
      alert(res?.error || "開始遊戲失敗");
      return null;
    }

    const newGameId = Number(res?.game_id || 0);

    setGameId(newGameId);
    setSBalance(Number(res?.s_balance ?? Math.max(0, sBalance - betAmount)));
    setGameStarted(true);
    setStatus("playing");

    return newGameId;
  }

  function getWrongKeeperPoint(row, col) {
    let wrongCol;
    let wrongRow;

    if (col <= 1) {
      wrongCol = 4;
    } else if (col >= 3) {
      wrongCol = 0;
    } else {
      wrongCol = Math.random() > 0.5 ? 0 : 4;
    }

    if (row === 0) {
      wrongRow = 2;
    } else if (row === 2) {
      wrongRow = 0;
    } else {
      wrongRow = Math.random() > 0.5 ? 0 : 2;
    }

    const point = getGridPoint(wrongRow, wrongCol);

    return {
      x: point.x,
      y: point.y,
      rotate: wrongCol < 2 ? -18 : 18,
    };
  }

async function shootPoint(row, col) {
  if (shooting) return;
  if (resultLocked) return;

  clearTimers();

  let activeGameId = gameId;

  if (status === "goal" && currentShot >= 5) {
    setMessage(`已完成 5 球，請先領取 ${money(currentWin)} S幣`);
    return;
  }

  const shotPoint = getGridPoint(row, col);

  setStatus("playing");
  setSelectedPoint({ row, col });
  setShooting(true);
  setResultLocked(true);
  setMessage("球員準備射門...");

  let res = null;

  try {
    if (!activeGameId) {
      // 第一球：扣 S幣 + 建立遊戲 + 判斷第一球，一支 API 完成
      res = await api.footballStartShoot();
    } else {
      // 第二球以後：沿用原本 shoot
      res = await api.footballShoot(activeGameId);
    }
  } catch (_) {
    res = { success: false, error: "射門失敗" };
  }

  if (!res?.success) {
    alert(res?.error || "射門失敗");
    setShooting(false);
    setResultLocked(false);
    resetVisualOnly();
    return;
  }

  activeGameId = Number(res?.game_id || activeGameId || 0);

  if (activeGameId) {
    setGameId(activeGameId);
    setGameStarted(true);
  }

  if (typeof res?.s_balance !== "undefined") {
    setSBalance(Number(res.s_balance || 0));
  }

  const isGoal = Boolean(res?.is_goal);

  if (isGoal) {
    const wrongKeeper = getWrongKeeperPoint(row, col);

    // 後端結果回來後，球和手套一起動
    setKeeperPos(wrongKeeper);
    setBall({
      x: shotPoint.x,
      y: shotPoint.y,
      active: true,
    });

    resultTimerRef.current = setTimeout(() => {
      const nextShot = Number(res?.current_step || currentShot + 1);
      const win = Number(res?.current_win || 0);

      setCurrentShot(nextShot);
      setCurrentWin(win);
      setStatus("goal");

      if (nextShot >= 5) {
        setMessage(`GOAL！已完成 5 球，可領取 ${money(win)} S幣`);
      } else {
        setMessage(`GOAL！目前可領取 ${money(win)} S幣`);
      }

      setShooting(false);
      resetAfterGoal(nextShot, win);
    }, 700);
  } else {
    setKeeperPos({
      x: shotPoint.x,
      y: shotPoint.y,
      rotate: col < 2 ? -18 : col > 2 ? 18 : 0,
    });

    setBall({
      x: shotPoint.x,
      y: shotPoint.y,
      active: true,
    });

    resultTimerRef.current = setTimeout(() => {
      setCurrentWin(0);
      setGameId(0);
      setGameStarted(false);
      setStatus("lost");
      setMessage("SAVE！被守門員擋下，本局獎金歸 0");
      setShooting(false);
      resetAfterSave();
    }, 700);
  }
}

  async function cashOut() {
    if (currentWin <= 0) return;
    if (!gameId) return;
    if (cashAnimation.show) return;

    clearTimers();

    const res = await api.footballClaim(gameId);
    if (!res?.success) {
      alert(res?.error || "領取失敗");
      return;
    }

    const winAmount = Number(res?.amount || currentWin || 0);
    const duration = 1000;
    const startTime = Date.now();

    setCashAnimation({
      show: true,
      amount: winAmount,
      display: 0,
    });

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const displayValue = Math.floor(winAmount * easedProgress);

      setCashAnimation({
        show: true,
        amount: winAmount,
        display: displayValue,
      });

      if (progress >= 1) {
        clearInterval(timer);

        setTimeout(() => {
          setSBalance(Number(res?.s_balance || 0));
          setGameId(0);
          setGameStarted(false);
          setStatus("cashed");
          setMessage(`成功領取 ${money(winAmount)} S幣，點擊球網可開始新局`);
          setCurrentShot(0);
          setCurrentWin(0);
          resetVisualOnly();

          setCashAnimation({
            show: false,
            amount: 0,
            display: 0,
          });

          onRefreshMe?.({ silent: true, force: true });
          loadFootballConfig();
        }, 500);
      }
    }, 16);
  }

  const displayPrizes = normalizePrizeList(prizes);

  return (
    <div className="mFootPage">
      {screen === "intro" && (
        <div className="mFootIntro">
          <div className="mFootGameTitle">2026 SUPER CUP</div>

          <div className="mFootIntroGoal">
            <img className="mFootIntroGoalImage" src="/images/goal-hero.png" alt="GOAL" />
          </div>

          <h1>足球射門奪寶</h1>

          <p>
            使用 S幣挑戰足球射門，最多 5 顆球。進球後可以直接領取，也可以繼續挑戰更高倍率。
          </p>

          {!activityEnabled && (
            <div className="mFootBalanceCard">足球射門活動尚未開放</div>
          )}

<div className="mFootOddsLine">
  {displayPrizes.map((item, index) => {
    const multiplierList = ["2x", "4x", "8x", "16x", "32x"];
    const label = multiplierList[index] || "0x";

    return (
      <div key={`${item.ball_no}-${index}`} className="mFootOddBox">
        <small>第{index + 1}球</small>
        <strong>{label}</strong>
      </div>
    );
  })}
</div>

          <button
            className="mFootMainBtn"
            type="button"
            onClick={goSelectTeam}
            disabled={loadingConfig || !activityEnabled}
          >
            ▶ 開始遊戲
          </button>

          <div className="mFootBalanceCard">
            目前 S幣：{money(sBalance)}
          </div>
        </div>
      )}

      {screen === "team" && (
        <div className="mFootTeamScreen">
          <h2>選擇你的球隊</h2>

          <div className="mFootTeamGrid">
            {TEAMS.map((team) => (
              <button
                key={team.id}
                type="button"
                className={selectedTeam?.id === team.id ? "mFootTeamCard active" : "mFootTeamCard"}
                onClick={() => setSelectedTeam(team)}
              >
                <img className="mFootTeamLogo" src={team.logo} alt={team.name} />
                <b>{team.name}</b>
              </button>
            ))}
          </div>

          <button
            className="mFootConfirmBtn"
            type="button"
            disabled={!selectedTeam}
            onClick={confirmTeam}
          >
            確認
          </button>
        </div>
      )}

      {screen === "game" && (
        <div className="mFootGameScreen">
          <div className="mFootGameHeaderPanel">
<div className="mFootProgressBar">
  {displayPrizes.map((item, index) => {
    const multiplierList = ["2x", "4x", "8x", "16x", "32x"];
    const label = multiplierList[index] || "0x";

    return (
      <div
        key={`${item.ball_no}-${index}`}
        className={index < currentShot ? "mFootStep done" : "mFootStep"}
      >
        <span>{label}</span>
      </div>
    );
  })}
</div>

            <div className="mFootVersus">
              <img className="mFootVersusLogo" src={selectedTeam?.logo} alt={selectedTeam?.name} />
              <b>VS</b>
              <img className="mFootVersusLogo" src={opponentTeam?.logo} alt={opponentTeam?.name} />
            </div>
          </div>

          <div className="mFootMessageBox">
            <strong>{message}</strong>
            <span>本球機率：{currentRateText}</span>
          </div>

          <div className="mFootGoalArea">
            <div className="mFootStadiumGlow"></div>
            <div className="mFootNet"></div>

            <div className="mFootShotGrid">
              {Array.from({ length: 15 }).map((_, index) => {
                const row = Math.floor(index / 5);
                const col = index % 5;
                const isActive = selectedPoint?.row === row && selectedPoint?.col === col;

                return (
                  <button
                    key={index}
                    type="button"
                    className={isActive ? "mFootShotPoint active" : "mFootShotPoint"}
                    onClick={() => shootPoint(row, col)}
                    disabled={shooting || resultLocked}
                    aria-label={`射門點 ${row + 1}-${col + 1}`}
                  />
                );
              })}
            </div>

            <div
              className="mFootKeeper"
              style={{
                left: `${keeperPos.x}%`,
                top: `${keeperPos.y}%`,
                transform: `translate(-50%, -50%) rotate(${keeperPos.rotate}deg)`,
              }}
            >
              🧤
            </div>

            <div
              className={ball.active ? "mFootBall flying" : "mFootBall"}
              style={{
                left: `${ball.active ? ball.x : 50}%`,
                top: `${ball.active ? ball.y : 82}%`,
              }}
            >
              ⚽
            </div>

            {status === "goal" && <div className="mFootResult goal">GOAL!</div>}
            {status === "lost" && <div className="mFootResult miss">SAVE!</div>}

            {status === "goal" && currentWin > 0 && (
              <button className="mFootCashCircleBtn" type="button" onClick={cashOut}>
                領取
              </button>
            )}
          </div>

          {cashAnimation.show && (
            <div className="mFootCashOverlay">
              <div className="mFootCashBox">
                <div className="mFootCashTitle">領取成功</div>
                <div className="mFootCashAmount">+{money(cashAnimation.display)}</div>
                <div className="mFootCashHint">S幣結算中...</div>
              </div>
            </div>
          )}

          <div className="mFootWalletPanel">
            <div>
              <small>投注</small>
              <strong>{money(betAmount)}</strong>
            </div>
            <div>
              <small>S幣</small>
              <strong>{money(sBalance)}</strong>
            </div>
            <div>
              <small>目前可領</small>
              <strong>{money(currentWin)}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}