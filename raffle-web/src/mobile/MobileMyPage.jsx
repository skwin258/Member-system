import React, { useMemo, useState } from "react";
import { api } from "../api";
import "./MobileMyPage.css";
import { formatTaipeiDate } from "../utils/taipeiTime";

function fmtDate(s) {
  return formatTaipeiDate(s) || "-";
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString("zh-TW");
}

export default function MobileMyPage({ me, onRefreshMe, goPage }) {
  const u = me?.user || {};

  const [activeTab, setActiveTab] = useState("profile");

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
    <div className="mMyPage">
      <div className="mMyHero">
        <div className="mMyHeroTop">
          <div className="mMyAvatarWrap">
            <div className="mMyAvatar">🙍‍♂️</div>
          </div>

          <div className="mMyHeroInfo">
            <div className="mMyHeroWelcome">
              親愛的{u.display_name || u.username || "貴賓"}，您好
            </div>
            <div className="mMyHeroUser">{u.username || "000000"}</div>
          </div>
        </div>

<div className="mMyVipBar">
  <button
    type="button"
    className="mMyVipItem mMyVipBtn"
    onClick={() => alert("活動尚未推出")}
  >
    👑 VIP特權
  </button>

  <div className="mMyVipDivider" />

  <button
    type="button"
    className="mMyVipItem mMyVipBtn"
    onClick={() => alert("活動尚未推出")}
  >
    🎁 紅利禮包
  </button>
</div>
      </div>

      <div className="mMyActionRow">
        <button
          type="button"
          className={`mMyActionBtn ${activeTab === "profile" ? "isActive" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <span className="mMyActionIcon">👤</span>
          <span>個人資料</span>
        </button>

        <button
          type="button"
          className={`mMyActionBtn ${activeTab === "wallet" ? "isActive" : ""}`}
          onClick={() => setActiveTab("wallet")}
        >
          <span className="mMyActionIcon">💳</span>
          <span>我的錢包</span>
        </button>

        <button
          type="button"
          className={`mMyActionBtn ${activeTab === "bank" ? "isActive" : ""}`}
          onClick={() => setActiveTab("bank")}
        >
          <span className="mMyActionIcon">🏦</span>
          <span>銀行管理</span>
        </button>
      </div>

      <div className="mMyContentCard">
        {activeTab === "profile" ? (
          <>
            <div className="mMyContentTitle">個人資料</div>

            <div className="mMyList">
              <div className="mMyInfoRow">
                <div className="mMyInfoLabel">帳號</div>
                <div className="mMyInfoValue">{u.username || "-"}</div>
              </div>

              <div className="mMyInfoRow">
                <div className="mMyInfoLabel">名稱</div>
                <div className="mMyInfoValue">{u.display_name || "-"}</div>
              </div>

              <div className="mMyInfoRow">
                <div className="mMyInfoLabel">註冊時間</div>
                <div className="mMyInfoValue">{fmtDate(u.created_at)}</div>
              </div>

              <div className="mMyInfoRow isBlock">
                <div className="mMyInfoLabel">生日</div>
                <div className="mMyInfoValue">
                  {birthdayLocked ? (
                    <div className="mMyLockedText">{fmtDate(birthday)}</div>
                  ) : (
                    <div className="mMyInputStack">
                      <input
                        className="mMyInput"
                        type="date"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                      />
                      <button
                        type="button"
                        className="mMyPrimaryBtn"
                        disabled={!birthday}
                        onClick={saveBirthday}
                      >
                        確認生日
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mMyInfoRow isBlock">
                <div className="mMyInfoLabel">LINE ID</div>
                <div className="mMyInfoValue">
                  {lineIdLocked ? (
                    <div className="mMyLineVerifyBox">
                      <div className="mMyLockedText">{lineId || "-"}</div>
                      {lineVerified ? (
                        <span className="mMyVerifiedBadge">✓ 已驗證</span>
                      ) : (
                        <button
                          type="button"
                          className="mMyGhostBtn"
                          onClick={verifyLineId}
                        >
                          聯絡客服
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mMyInputStack">
                      <input
                        className="mMyInput"
                        value={lineId}
                        onChange={(e) => setLineId(e.target.value)}
                        placeholder="請輸入您的 LINE ID"
                      />
                      <button
                        type="button"
                        className="mMyPrimaryBtn"
                        onClick={verifyLineId}
                      >
                        認證
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : activeTab === "wallet" ? (
          <>
            <div className="mMyContentTitle">我的錢包</div>

            <div className="mMyWalletSection">
              <div className="mMyWalletBlock">
                <div className="mMyWalletLeft">
                  <div className="mMyWalletLabel">S幣</div>
                  <div className="mMyWalletAmount">
                    {fmtNum(u.s_balance ?? u.s_coin ?? 0)}
                  </div>
                </div>
                <button
                  type="button"
                  className="mMyWalletBtn"
                  onClick={() => handleUseWallet("s_coin")}
                >
                  使用
                </button>
              </div>

              <div className="mMyWalletBlock">
                <div className="mMyWalletLeft">
                  <div className="mMyWalletLabel">福利金額</div>
                  <div className="mMyWalletAmount">
                    {fmtNum(u.welfare_balance)}
                  </div>
                </div>
                <button
                  type="button"
                  className="mMyWalletBtn"
                  onClick={() => handleUseWallet("welfare_balance")}
                >
                  兌換
                </button>
              </div>

              <div className="mMyWalletBlock">
                <div className="mMyWalletLeft">
                  <div className="mMyWalletLabel">折抵金</div>
                  <div className="mMyWalletAmount">
                    {fmtNum(u.discount_balance)}
                  </div>
                </div>
                <button
                  type="button"
                  className="mMyWalletBtn"
                  onClick={() => handleUseWallet("discount_balance")}
                >
                  兌換
                </button>
              </div>

              <div className="mMyWalletNotice">
                S幣可前往商城使用；福利金額與折抵金請聯絡客服協助處理。
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mMyContentTitle">銀行管理</div>

            <div className="mMyBankForm">
              <div className="mMyField">
                <label className="mMyFieldLabel">戶名</label>
                {bankLocked ? (
                  <div className="mMyLockedBox">{u.bank_holder || "-"}</div>
                ) : (
                  <input
                    className="mMyInput"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    placeholder="例：王小明"
                  />
                )}
              </div>

              <div className="mMyField">
                <label className="mMyFieldLabel">銀行代碼</label>
                {bankLocked ? (
                  <div className="mMyLockedBox">{u.bank_name || "-"}</div>
                ) : (
                  <input
                    className="mMyInput"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="例：台新812 / 國泰013 / 玉山808"
                  />
                )}
              </div>

              <div className="mMyField">
                <label className="mMyFieldLabel">分行</label>
                {bankLocked ? (
                  <div className="mMyLockedBox">{u.bank_branch || "-"}</div>
                ) : (
                  <input
                    className="mMyInput"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="例：信義分行"
                  />
                )}
              </div>

              <div className="mMyField">
                <label className="mMyFieldLabel">帳號</label>
                {bankLocked ? (
                  <div className="mMyLockedBox">{u.bank_account || "-"}</div>
                ) : (
                  <input
                    className="mMyInput"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="請輸入銀行帳號"
                  />
                )}
              </div>

              <div className="mMyField">
                <label className="mMyFieldLabel">說明</label>
                <div className="mMyHintBox">
                  提醒：生日 / LINE ID / 銀行資料填寫後會鎖定，若需修改請聯繫客服。
                </div>
              </div>

              <button
                type="button"
                className="mMySaveBtn"
                disabled={!canSaveBank}
                onClick={saveBankProfile}
              >
                儲存資料
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}