import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { dailyTaskNames } from "../lib/dailyTasks";
import "./dailyTasks.css";

const socialMessages = { share_post: "轉發", like_post: "點讚", share_story: "限動" };
const verification = { instagram: "Instagram", threads: "Threads" };

export default function DailyTasks({ onClose, lineUrl }) {
  const dialog = useRef(null);
  const loadVersion = useRef(0);
  const running = useRef(false);
  const [data, setData] = useState(null);
  const [step, setStep] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const version = ++loadVersion.current;
    const result = await api.dailyTasks();
    if (version !== loadVersion.current) return;
    if (!result?.success) throw new Error(result?.error || "無法讀取每日任務");
    setData(result);
  }

  useEffect(() => {
    dialog.current.showModal();
    function refresh() {
      if (!running.current) void load().catch(err => setError(err.message));
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      loadVersion.current++;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!data?.day) return;
    const midnight = Date.parse(data.day + "T00:00:00+08:00") + 86400000;
    const timer = window.setInterval(() => {
      if (Date.now() >= midnight && !running.current) {
        void run(load);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [data?.day]);

  function openStep(task) {
    setFile(null);
    setError("");
    setStep(task);
  }

  async function run(operation) {
    if (running.current) return;
    running.current = true;
    loadVersion.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (err) {
      setError(err.message || "操作失敗，請重試");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function activate(task, status) {
    if (status === "approved") {
      return run(async () => {
        const result = await api.claimDailyTask(task);
        if (!result?.success) throw new Error(result?.error || "領取失敗");
        setData(result);
        setNotice("已領取 1 次紅包抽獎機會");
      });
    }
    if (task === "checkin") {
      return run(async () => {
        const result = await api.checkInDailyTasks();
        if (!result?.success) throw new Error(result?.error || "簽到失敗");
        setData(result);
      });
    }
    openStep(task);
  }

  function submit(event) {
    event.preventDefault();
    if (!file) return;
    void run(async () => {
      const result = await api.uploadDailyTaskProof(step, file);
      if (!result?.success) throw new Error(result?.error || "送出失敗");
      setData(result);
      openStep("");
      setNotice("已送出，請等候審核");
    });
  }

  function close() {
    if (busy) return;
    if (step) openStep("");
    else onClose();
  }

  const progress = data?.progress ?? 0;
  const officialLine = /^https:\/\/(?:lin\.ee|line\.me|page\.line\.me)\//i.test(lineUrl || "") ? lineUrl : "";
  return <dialog ref={dialog} className={`daily-tasks-dialog${step ? " daily-tasks-detail" : ""}`}
    aria-label={step ? dailyTaskNames[step] : "每日任務"}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    {step ? <section className="daily-task-instructions">
      <button type="button" className="daily-task-detail-close" aria-label="關閉說明" onClick={close}>×</button>
      <h2>{dailyTaskNames[step]}</h2>
      {verification[step] ? <form onSubmit={submit}>
        <p>請截圖本人常使用 {verification[step]} 的首頁截圖</p>
        <label>選擇檔案
          <input type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy}
            onChange={event => setFile(event.target.files[0] || null)} />
        </label>
        <button className="daily-task-action" type="submit" disabled={!file || busy}>{busy ? "送出中…" : "送出"}</button>
      </form> : <>
        <p>請私訊官方 LINE「我要{socialMessages[step]}」</p>
        {officialLine ? <a className="daily-task-action" href={officialLine} target="_blank" rel="noreferrer">前往官方 LINE</a>
          : <p>官方 LINE 連結暫時無法取得。</p>}
      </>}
      {error && <p role="alert">{error}</p>}
    </section> : <div className="daily-task-frame">
      <button type="button" className="daily-task-frame-close" aria-label="關閉每日任務" onClick={close} />
      <section className="daily-task-content">
        <div className="daily-task-progress"><strong>今日進度</strong><span>{progress}/4</span></div>
        <progress max={4} value={progress} aria-label="今日任務進度" />
        <div className="daily-task-list">
          {data && Object.entries(dailyTaskNames).filter(([task]) => !data.hiddenTasks?.includes(task)).map(([task, name]) => {
            const status = data.tasks?.[task];
            const label = status === "claimed" ? "已領取" : status === "pending" ? "審核中"
              : status === "rejected" ? "重新送出" : status === "approved" ? "領取" : task === "checkin" ? "簽到" : "前往";
            return <div className="daily-task-row" key={task}>
              <span>{name}</span>
              <span className="daily-task-reward"><img alt="紅包" src="/arcade/treasure/fantasy/red-envelope-preview.png" />×1</span>
              <button type="button" className="daily-task-action"
                disabled={busy || status === "claimed" || status === "pending"}
                onClick={() => activate(task, status)}>{label}</button>
            </div>;
          })}
        </div>
        <p className="daily-task-status" role={error ? "alert" : "status"}>
          {error || notice || (!data ? "讀取任務中…" : "")}
          {error && !data && <button type="button" onClick={() => run(load)} disabled={busy}>重試</button>}
        </p>
        <p className="daily-task-rules">如發現轉發／點讚／限動未滿 24h 即取消紅包中獎結果<br />SK 會員中心保有最終解釋權</p>
      </section>
    </div>}
  </dialog>;
}
