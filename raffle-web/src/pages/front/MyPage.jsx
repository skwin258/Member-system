import React, { useMemo, useState } from "react";
import { api } from "../../api";
import "./myPage.css";
import { formatTaipeiDate } from "../../utils/taipeiTime";

function fmtDate(s) {
  return formatTaipeiDate(s) || "-";
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString("zh-TW");
}

export default function MyPage({ me, onRefreshMe, goPage }) {
  const u = me?.user || {};

  const [birthday, setBirthday] = useState(u.birthday || "");
  const birthdayLocked = Boolean(u.birthday);

  const [lineId, setLineId] = useState(u.line_id || "");
  const lineIdLocked = Boolean(u.line_id);

  const [bankHolder, setBankHolder] = useState(u.bank_holder || "");
  const [bankName, setBankName] = useState(u.bank_name || "");
  const [bankBranch, setBankBranch] = useState(u.bank_branch || "");
  const [bankAccount, setBankAccount] = useState(u.bank_account || "");
  const bankLocked = Boolean(
    u.bank_holder || u.bank_name || u.bank_branch || u.bank_account
  );

  const lineVerified = Number(u.line_verified || 0) === 1;

  const canSaveBank = useMemo(() => {
    const patch = {};

    if (!lineIdLocked && lineId) patch.line_id = lineId;

    if (!bankLocked && (bankHolder || bankName || bankBranch || bankAccount)) {
      if (bankHolder) patch.bank_holder = bankHolder;
      if (bankName) patch.bank_name = bankName;
      if (bankBranch) patch.bank_branch = bankBranch;
      if (bankAccount) patch.bank_account = bankAccount;
    }

    return Object.keys(patch).length > 0;
  }, [
    lineIdLocked,
    lineId,
    bankLocked,
    bankHolder,
    bankName,
    bankBranch,
    bankAccount,
  ]);

  async function saveBirthday() {
    if (birthdayLocked || !birthday) return;

    try {
      const r = await api.updateProfile({ birthday });
      if (r?.success === false) throw new Error(r?.error || "生日更新失敗");
      alert("生日已更新 ✅");
      await onRefreshMe?.();
    } catch (e) {
      alert(String(e?.message || e || "生日更新失敗"));
    }
  }

  async function saveBankProfile() {
    const patch = {};

    if (!lineIdLocked && lineId) patch.line_id = lineId;

    if (!bankLocked && (bankHolder || bankName || bankBranch || bankAccount)) {
      if (bankHolder) patch.bank_holder = bankHolder;
      if (bankName) patch.bank_name = bankName;
      if (bankBranch) patch.bank_branch = bankBranch;
      if (bankAccount) patch.bank_account = bankAccount;
    }

    if (Object.keys(patch).length === 0) {
      alert("沒有可更新的資料");
      return;
    }

    try {
      const r = await api.updateProfile(patch);
      if (r?.success === false) throw new Error(r?.error || "更新失敗");
      alert("資料已更新 ✅");
      await onRefreshMe?.();
    } catch (e) {
      alert(String(e?.message || e || "更新失敗"));
    }
  }

  async function verifyLineId() {
    if (lineIdLocked) {
      goPage?.("support");
      return;
    }

    if (!lineId) {
      alert("請先輸入 LINE ID");
      return;
    }

    try {
      const r = await api.updateProfile({ line_id: lineId });

      if (r?.success === false) {
        throw new Error(r?.error || "LINE ID 儲存失敗");
      }

      alert("LINE ID 已提交，請聯絡客服完成驗證");

      await onRefreshMe?.();
      goPage?.("support");
    } catch (e) {
      alert(String(e?.message || e || "LINE ID 儲存失敗"));
    }
  }

  function handleUseWallet(type) {
    if (type === "s_coin") {
      goPage?.("shop");
      return;
    }

    if (type === "welfare_balance") {
      goPage?.("support");
      return;
    }

    if (type === "discount_balance") {
      goPage?.("support");
      return;
    }
  }

  return (
    <div className="myShell">
      <div className="myTopCard">
        <div className="myTopLeft">
          <div className="myAvatar">👤</div>
          <div className="myUserInfo">
            <div className="myUserId">{u.username || "000000"}</div>
            <div className="myVip">VIP</div>
          </div>
        </div>

        <div className="myTopRight">
          <div className="myTitle">個人資料</div>
          <div className="mySub">為了確保您的帳戶安全，請您填寫相關安全信息，以備不時之需</div>
        </div>
      </div>

      <div className="myCardsGrid">
        <div className="myCard">
          <div className="myCardTitle">帳號資訊</div>

          <div className="myRow">
            <div className="myKey">帳號</div>
            <div className="myVal">{u.username || "-"}</div>
          </div>

          <div className="myRow">
            <div className="myKey">名稱</div>
            <div className="myVal">{u.display_name || "-"}</div>
          </div>

          <div className="myRow">
            <div className="myKey">生日</div>
            <div className="myVal">
              {birthdayLocked ? (
                <span>{fmtDate(birthday)}</span>
              ) : (
                <div className="myInlineAction">
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                  />
                  <button
                    type="button"
                    className="myMiniSaveBtn"
                    disabled={!birthday}
                    onClick={saveBirthday}
                  >
                    確認
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="myRow">
            <div className="myKey">LINE ID</div>
            <div className="myVal">
              <div className="myLineWrap">
                {lineIdLocked ? (
                  <span>{lineId || "-"}</span>
                ) : (
                  <input
                    placeholder="您的 LINE ID"
                    value={lineId}
                    onChange={(e) => setLineId(e.target.value)}
                  />
                )}

                {lineVerified ? (
                  <span className="myVerifiedBadge">✓ 已驗證</span>
                ) : (
                  <button
                    type="button"
                    className="myVerifyBtn"
                    onClick={verifyLineId}
                  >
                    認證
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="myRow">
            <div className="myKey">註冊時間</div>
            <div className="myVal">{fmtDate(u.created_at)}</div>
          </div>
        </div>

        <div className="myCard">
          <div className="myCardTitle">銀行管理</div>

          <div className="myRow">
            <div className="myKey">戶名</div>
            <div className="myVal">
              {bankLocked ? (
                <span>{u.bank_holder || "-"}</span>
              ) : (
                <input
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  placeholder="例：王小明"
                />
              )}
            </div>
          </div>

          <div className="myRow">
            <div className="myKey">銀行代碼</div>
            <div className="myVal">
              {bankLocked ? (
                <span>{u.bank_name || "-"}</span>
              ) : (
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="例：台新812 / 國泰013 / 玉山008"
                />
              )}
            </div>
          </div>

          <div className="myRow">
            <div className="myKey">分行</div>
            <div className="myVal">
              {bankLocked ? (
                <span>{u.bank_branch || "-"}</span>
              ) : (
                <input
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  placeholder="例：信義分行0040543"
                />
              )}
            </div>
          </div>

          <div className="myRow">
            <div className="myKey">帳號</div>
            <div className="myVal">
              {bankLocked ? (
                <span>{u.bank_account || "-"}</span>
              ) : (
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="僅數字"
                />
              )}
            </div>
          </div>

<div className="myRow myRow--action">
  <div className="myVal myVal--action">
    <button
      className="mySaveBtn"
      disabled={!canSaveBank}
      onClick={saveBankProfile}
    >
      儲存資料
    </button>
    <div className="myHint">
      提醒：生日 / LINE ID / 銀行資料填寫後會鎖定，若需修改請聯繫客服。
    </div>
  </div>
</div>
        </div>

        <div className="myCard">
          <div className="myCardTitle">我的錢包</div>

          <div className="myWalletRow">
            <div className="myWalletLeft">
              <div className="myWalletLabel">S幣</div>
              <div className="myWalletAmount">
                {fmtNum(u.s_balance ?? u.s_coin ?? 0)}
              </div>
            </div>
            <button
              className="myWalletUseBtn"
              type="button"
              onClick={() => handleUseWallet("s_coin")}
            >
              使用
            </button>
          </div>

          <div className="myWalletRow">
            <div className="myWalletLeft">
              <div className="myWalletLabel">福利金</div>
              <div className="myWalletAmount">{fmtNum(u.welfare_balance)}</div>
            </div>
            <button
              className="myWalletUseBtn"
              type="button"
              onClick={() => handleUseWallet("welfare_balance")}
            >
              提現
            </button>
          </div>

          <div className="myWalletRow">
            <div className="myWalletLeft">
              <div className="myWalletLabel">折抵金</div>
              <div className="myWalletAmount">{fmtNum(u.discount_balance)}</div>
            </div>
            <button
              className="myWalletUseBtn"
              type="button"
              onClick={() => handleUseWallet("discount_balance")}
            >
              兌換
            </button>
          </div>

          <div className="myWalletNotice">
            S幣可前往商城使用；福利金額與折抵金請聯絡客服協助處理。
          </div>
        </div>
      </div>
    </div>
  );
}