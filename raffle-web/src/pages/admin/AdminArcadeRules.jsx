import { useEffect, useState } from "react";
import { GAME_RULES } from "../../../../src/game-settings.js";
import { api } from "../../api";

const titles = {
  numbers: "數字追逐戰", reaction: "極速反應王", claw: "3D 夾娃娃機",
  football: "足球射門", redpacket: "紅包", wheel: "輪盤",
};
const labels = {
  enabled: "開放（1 開啟，0 關閉）", cost: "每局花費", grid: "數字盤每邊格數",
  minWait: "火炬最短等待（毫秒）", waitRange: "額外隨機等待上限（毫秒）",
  refundEarly: "搶跑退款（1 退款，0 不退款）", grip: "夾爪力道", moveSpeed: "橫移速度",
  damping: "夾爪阻尼", carryFactor: "上升爪力倍率", jolt: "頂部震動（公尺）",
  fingerFriction: "夾爪摩擦力", toyFriction: "娃娃摩擦力", dropSpeed: "下降速度", liftSpeed: "上升速度",
  toyMin: "娃娃最小尺寸（公尺）", toyMax: "娃娃最大尺寸（公尺）",
  reward: "每隻娃娃獎勵",
};
const thresholdFields = [1, 2, 3].flatMap(n => [`limit${n}`, `reward${n}`]);
for (const n of [1, 2, 3]) {
  labels[`limit${n}`] = `第 ${n} 檔門檻（毫秒）`;
  labels[`reward${n}`] = `第 ${n} 檔獎勵`;
}
const rewardFields = { numbers: thresholdFields, reaction: thresholdFields, claw: ["reward"] };

export default function AdminArcadeRules({ prizes = false }) {
  const [game, setGame] = useState("numbers");
  const [rules, setRules] = useState(null);
  const [football, setFootball] = useState([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const games = prizes ? ["numbers", "reaction", "claw", "football"] : Object.keys(titles);
  const footballPrizes = prizes && game === "football";
  const fields = prizes ? rewardFields[game] || [] : [
    ...Object.keys(GAME_RULES[game]).filter(key => !rewardFields[game]?.includes(key)), "help",
  ];

  useEffect(() => {
    api.arcadeSettings().then(result => {
      if (!result?.success) throw new Error(result?.error || "讀取失敗");
      setRules(result.settings);
    }).catch(error => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!footballPrizes) return;
    api.adminFootballPrizes().then(result => {
      if (!result?.success) throw new Error(result?.error || "讀取失敗");
      setFootball(result.prizes);
    }).catch(error => setMessage(error.message));
  }, [footballPrizes]);

  function update(field, value) {
    setRules(current => ({ ...current, [game]: { ...current[game], [field]: value } }));
  }

  function updatePrize(id, field, value) {
    setFootball(current => current.map(row => row.id === id ? { ...row, [field]: Number(value) } : row));
  }

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = footballPrizes
        ? await api.adminSaveFootballPrizes(football)
        : await api.adminSaveGameRules(game, Object.fromEntries(fields.map(field => [field, rules[game][field]])));
      if (!result?.success) throw new Error(result?.error || "儲存失敗");
      setMessage("已儲存");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending(false);
    }
  }

  return <form className="adminCard arcade-rule-form" onSubmit={save}>
    <h3>奪寶遊戲{prizes ? "獎勵與機率" : "玩法與難度"}</h3>
    <label>選擇遊戲
      <select className="input" value={game} onChange={event => { setGame(event.target.value); setMessage(""); }} disabled={pending}>
        {games.map(key => <option key={key} value={key}>{titles[key]}</option>)}
      </select>
    </label>
    {footballPrizes ? football.map(row => <fieldset key={row.id}>
      <legend>第 {row.ball_no} 球</legend>
      <label>進球機率（%）<input className="input" type="number" min="0" max="100" step="any" required
        value={row.probability} onChange={event => updatePrize(row.id, "probability", event.target.value)} /></label>
      <label>投注 1,000 的獎金（S 幣）<input className="input" type="number" min="0" max="100000" required
        value={row.reward_s} onChange={event => updatePrize(row.id, "reward_s", event.target.value)} /></label>
    </fieldset>) : rules && fields.map(field => {
      if (field === "help") return <label key={field}>遊戲說明
        <textarea className="input" maxLength={1600} placeholder="留空時使用預設說明"
          value={rules[game].help} onChange={event => update(field, event.target.value)} />
      </label>;
      const [min, max, , step = 1] = GAME_RULES[game][field];
      return <label key={field}>{labels[field]}
        <input className="input" type="number" min={min} max={max} step={step} required
          value={rules[game][field]} onChange={event => update(field, event.target.valueAsNumber)} />
      </label>;
    })}
    <button className="btn" type="submit" disabled={pending || !rules || (footballPrizes && !football.length)}>
      {pending ? "儲存中…" : "儲存遊戲設定"}
    </button>
    <p role="status">{message}</p>
  </form>;
}
