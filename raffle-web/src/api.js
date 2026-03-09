// raffle-web/src/api.js

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

const LS_TOKEN = "sk_token";
const LS_ADMIN_TOKEN = "sk_admin_token";

const __GET_MEMO__ = new Map();

function memoKey(path, auth = "") {
  return `${auth}::${path}`;
}

function clearMemo(keys = []) {
  for (const k of keys) {
    if (!k) continue;
    __GET_MEMO__.delete(k);
  }
}

async function memoizedGet(path, opts = {}, ttlMs = 800) {
  const auth = opts.auth || "";
  const key = memoKey(path, auth);
  const now = Date.now();
  const hit = __GET_MEMO__.get(key);

  if (hit?.promise) return hit.promise;
  if (hit?.data && hit.expiresAt > now) return hit.data;

  const p = request(path, opts)
    .then((data) => {
      __GET_MEMO__.set(key, {
        data,
        expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0),
      });
      return data;
    })
    .catch((err) => {
      __GET_MEMO__.delete(key);
      throw err;
    });

  __GET_MEMO__.set(key, { promise: p, expiresAt: now + Math.max(0, Number(ttlMs) || 0) });
  return p.finally(() => {
    const latest = __GET_MEMO__.get(key);
    if (latest?.promise === p) {
      __GET_MEMO__.delete(key);
    }
  });
}

/* =========================
 * Token helpers
========================= */
export function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}
export function setToken(t) {
  localStorage.setItem(LS_TOKEN, t || "");
}
export function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}

export function getAdminToken() {
  return localStorage.getItem(LS_ADMIN_TOKEN) || "";
}
export function setAdminToken(t) {
  localStorage.setItem(LS_ADMIN_TOKEN, t || "");
}
export function clearAdminToken() {
  localStorage.removeItem(LS_ADMIN_TOKEN);
}

/* =========================
 * Low-level request
 * - auto json parse
 * - auto attach token by opts.auth = "user" | "admin"
========================= */
async function request(path, opts = {}) {
  const auth = opts.auth; // "user" | "admin" | undefined

  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };

  // auto auth header
  if (auth === "user") {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  } else if (auth === "admin") {
    const t = getAdminToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    return {
      success: false,
      error: data?.error || `HTTP ${res.status}`,
      status: res.status,
      raw: data,
    };
  }

  return data || { success: true };
}

/* =========================
 * Admin Request Helper
 * ========================= */
async function adminRequest(path, { method = "GET", body, headers } = {}) {
  const token = getAdminToken();
  if (!token) {
    return { success: false, error: "no admin token" };
  }

  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
  };

  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);

  if (res.status === 401) {
    let msg = "Unauthorized";
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch (_) {}
    return { success: false, error: msg, status: 401 };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch (_) {}
    return { success: false, error: msg, status: res.status };
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  return { success: true, data: text };
}

export const api = {
  API_BASE,
  async getMyReferrals() {
    return await request("/referral/my", {
      method: "GET",
      auth: "user",
    });
  },



  /* -----------------
   * User Auth
  ----------------- */
  async login(username, password) {
    const r = await request("/auth/user/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const t = r?.token || r?.access_token || r?.data?.token || "";
    if (r?.success && t) setToken(t);
    return r;
  },

  async userLogin(username, password) {
    return await api.login(username, password);
  },

  /* -----------------
   * User Register
  ----------------- */
  async userRegister(payload) {
    return await request("/auth/user/register", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async me({ force = false } = {}) {
    const key1 = memoKey("/auth/me", "user");
    const key2 = memoKey("/me", "user");
    if (force) clearMemo([key1, key2]);

    const r1 = await memoizedGet("/auth/me", { method: "GET", auth: "user" }, 1200);
    if (r1?.success !== false) return r1;
    return await memoizedGet("/me", { method: "GET", auth: "user" }, 1200);
  },

  /* -----------------
   * Profile (0001 PATCH)
  ----------------- */
  async updateProfile(patch) {
    return await request("/user/profile", {
      method: "PATCH",
      auth: "user",
      body: JSON.stringify(patch || {}),
    });
  },

  /* -----------------
   * Wallet Logs (0001 PATCH)
  ----------------- */
  async walletLogs(params = {}) {
    const qs = new URLSearchParams();
    qs.set("days", String(params.days ?? 90));
    if (params.q) qs.set("q", params.q);
    if (params.category) qs.set("category", params.category);

    const query = qs.toString();
    return await request(`/wallet/logs${query ? `?${query}` : ""}`, {
      method: "GET",
      auth: "user",
    });
  },


  /* -----------------
   * Referral
  ----------------- */
  async getReferralCode() {
    return await request("/referral/code", {
      method: "GET",
      auth: "user",
    });
  },

  /* -----------------
   * Records
  ----------------- */
  async records(params = {}) {
    const qs = new URLSearchParams();

    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);

    if (params.status && params.status !== "all") qs.set("status", params.status);
    if (params.activity && params.activity !== "all") qs.set("activity", params.activity);

    if (params.account) qs.set("account", params.account);
    if (params.q) qs.set("q", params.q);

    const query = qs.toString();
    return await request(`/records${query ? `?${query}` : ""}`, {
      method: "GET",
      auth: "user",
    });
  },

  /* -----------------
   * Activities (Home)
  ----------------- */
  async activities({ force = false } = {}) {
    const key = memoKey("/activities", "");
    if (force) clearMemo([key]);
    return await memoizedGet("/activities", { method: "GET" }, 5000);
  },

    /* -----------------
   * Shop (Public)
  ----------------- */
  async shopProducts() {
    return await request("/shop/products", { method: "GET" });
  },

  async shopConfig() {
    return await request("/shop/config", { method: "GET" });
  },

  // ✅ 0001 PATCH: 兌換商品（扣 S幣）
  async shopRedeem(product_id) {
    return await request("/shop/redeem", {
      method: "POST",
      auth: "user",
      body: JSON.stringify({ product_id }),
    });
  },

  // ✅ 0001 PATCH: 我的兌換紀錄
  async shopOrders(params = {}) {
    const qs = new URLSearchParams();
    qs.set("days", String(params.days ?? 90));
    const query = qs.toString();
    return await request(`/shop/orders${query ? `?${query}` : ""}`, {
      method: "GET",
      auth: "user",
    });
  },

  /* -----------------
   * Redpacket
  ----------------- */
  async redpacketDraw() {
    const res = await request("/redpacket/draw", {
      method: "POST",
      auth: "user",
      body: JSON.stringify({}),
    });
    clearMemo([
      memoKey("/auth/me", "user"),
      memoKey("/me", "user"),
      memoKey("/redpacket/history", "user"),
    ]);
    return res;
  },

  async drawRedpacket() {
    return await api.redpacketDraw();
  },

  // ✅ 新增：每日領取一次（只 +1 次數，不抽）
  async redpacketClaim() {
    const res = await request("/redpacket/claim", {
      method: "POST",
      auth: "user",
      body: JSON.stringify({}),
    });
    clearMemo([memoKey("/auth/me", "user"), memoKey("/me", "user")]);
    return res;
  },

  // ✅ 新增：右側中獎紀錄（沒有後端也沒關係，前端會 fallback）
  async redpacketHistory({ force = false } = {}) {
    const key = memoKey("/redpacket/history", "user");
    if (force) clearMemo([key]);
    return await memoizedGet("/redpacket/history", {
      method: "GET",
      auth: "user",
    }, force ? 0 : 1200);
  },

  async redpacketPrizes() {
    return await request("/redpacket/prizes", { method: "GET" });
  },

  /* -----------------
   * Wheel
  ----------------- */
  async wheelSpin() {
    const res = await request("/wheel/spin", {
      method: "POST",
      auth: "user",
      body: JSON.stringify({}),
    });
    clearMemo([
      memoKey("/auth/me", "user"),
      memoKey("/me", "user"),
      memoKey("/wheel/history", "user"),
    ]);
    return res;
  },

  async spinWheel() {
    return await api.wheelSpin();
  },

  // ✅ 修正：只保留一個 wheelPrizes，避免重複定義覆蓋
  async wheelPrizes() {
    return await request("/wheel/prizes", { method: "GET" });
  },

  async wheelItems() {
    return await api.wheelPrizes();
  },

  async wheelClaim() {
    const res = await request("/wheel/claim", {
      method: "POST",
      auth: "user",
      body: JSON.stringify({}),
    });
    clearMemo([memoKey("/auth/me", "user"), memoKey("/me", "user")]);
    return res;
  },

  // ✅ 輪盤歷史中獎（全部使用者）
  async wheelHistory({ force = false } = {}) {
    const key = memoKey("/wheel/history", "user");
    if (force) clearMemo([key]);
    return await memoizedGet("/wheel/history", {
      method: "GET",
      auth: "user",
    }, force ? 0 : 1200);
  },

  /* -----------------
   * Number Lottery
  ----------------- */
  async numberDraw(payload = {}) {
    return await request("/number/draw", {
      method: "POST",
      auth: "user",
      body: JSON.stringify(payload || {}),
    });
  },

  async numberLotteryDraw(payload = {}) {
    return await api.numberDraw(payload);
  },

  async numberPrizes() {
    return await request("/number/prizes", { method: "GET" });
  },

  /* -----------------
   * Admin Auth
  ----------------- */
  async adminLogin(username, password) {
    const r = await request("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const t = r?.token || r?.access_token || r?.data?.token || "";
    if (r?.success && t) setAdminToken(t);
    return r;
  },

  async adminMe() {
    return await request("/admin/me", { method: "GET", auth: "admin" });
  },

  async adminChangePassword(old_password, new_password) {
    return await request("/admin/change-password", {
      method: "POST",
      auth: "admin",
      body: JSON.stringify({ old_password, new_password }),
    });
  },

  /* -----------------
   * Admin Activities
  ----------------- */
  async adminActivities() {
    return await request("/admin/activities", { method: "GET", auth: "admin" });
  },

  async adminPatchActivity(key, patch) {
    return await request(`/admin/activities/${encodeURIComponent(key)}`, {
      method: "PATCH",
      auth: "admin",
      body: JSON.stringify(patch || {}),
    });
  },

  /* -----------------
   * Admin Promotions
  ----------------- */
  async adminPromotions() {
    return await request("/admin/promotions", { method: "GET", auth: "admin" });
  },

  async adminCreatePromotion(payload) {
    return await request("/admin/promotions", {
      method: "POST",
      auth: "admin",
      body: JSON.stringify(payload || {}),
    });
  },

  async adminUpdatePromotion(id, patch) {
    return await request(`/admin/promotions/${id}`, {
      method: "PATCH",
      auth: "admin",
      body: JSON.stringify(patch || {}),
    });
  },

  async adminDeletePromotion(id) {
    return await request(`/admin/promotions/${id}`, {
      method: "DELETE",
      auth: "admin",
    });
  },

  async adminUploadPromotionImage(file) {
    const token = getAdminToken();
    if (!token) {
      return { success: false, error: "Unauthorized", status: 401 };
    }
    if (!file) {
      return { success: false, error: "file required", status: 400 };
    }

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`${API_BASE}/admin/promotions/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      return {
        success: false,
        error: data?.error || `HTTP ${res.status}`,
        status: res.status,
        raw: data,
      };
    }

    return data || { success: true };
  },

    // ✅ 新增：通用上傳圖片（給輪盤獎項用）
  // 先沿用你既有的 /admin/promotions/upload
  async adminUploadImage(file) {
    const token = getAdminToken();
    if (!token) {
      return { success: false, error: "Unauthorized", status: 401 };
    }
    if (!file) {
      return { success: false, error: "file required", status: 400 };
    }

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`${API_BASE}/admin/promotions/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      return {
        success: false,
        error: data?.error || `HTTP ${res.status}`,
        status: res.status,
        raw: data,
      };
    }

    return data || { success: true };
  },

  /* -----------------
   * Admin Users
  ----------------- */
  async adminListUsers(q = "") {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return await request(`/admin/users${qs}`, { method: "GET", auth: "admin" });
  },

  async adminCreateUser(payload) {
    return await request("/admin/users", {
      method: "POST",
      auth: "admin",
      body: JSON.stringify(payload || {}),
    });
  },

  async adminUpdateUser(id, patch) {
    return await request(`/admin/users/${id}`, {
      method: "PATCH",
      auth: "admin",
      body: JSON.stringify(patch || {}),
    });
  },


  async adminRemoveUser(id) {
    return await request(`/admin/users/${id}`, {
      method: "DELETE",
      auth: "admin",
    });
  },
// ✅ 0001 PATCH: 讀單一使用者（給新後台 modal 用）
async adminGetUser(id) {
  return await request(`/admin/users/${id}`, { method: "GET", auth: "admin" });
},

// ✅ 0001 PATCH: 搜尋使用者（alias）
async adminSearchUsers(q = "") {
  return await api.adminListUsers(q);
},

// ✅ 0001 PATCH: 調整錢包（S幣/福利金/折抵金）
async adminAdjustWallet(id, payload) {
  return await request(`/admin/users/${id}/wallet`, {
    method: "POST",
    auth: "admin",
    body: JSON.stringify(payload || {}),
  });
},

// ✅ 0001 PATCH: 讀使用者錢包流水
async adminUserWalletLogs(id, params = {}) {
  const qs = new URLSearchParams();
  qs.set("days", String(params.days ?? 90));
  const query = qs.toString();
  return await request(`/admin/users/${id}/logs${query ? `?${query}` : ""}`, {
    method: "GET",
    auth: "admin",
  });
},

// ✅ 0001 PATCH: 讀使用者兌換紀錄
async adminUserOrders(id, params = {}) {
  const qs = new URLSearchParams();
  qs.set("days", String(params.days ?? 90));
  const query = qs.toString();
  return await request(`/admin/users/${id}/orders${query ? `?${query}` : ""}`, {
    method: "GET",
    auth: "admin",
  });
},

async adminShopOrders(params = {}) {
  const qs = new URLSearchParams();
  qs.set("days", String(params.days ?? 90));
  const query = qs.toString();

  return await request(`/admin/shop/orders${query ? `?${query}` : ""}`, {
    method: "GET",
    auth: "admin",
  });
},

async adminToggleShopOrderReview(id) {
  return await request(`/admin/shop/orders/${id}/review`, {
    method: "POST",
    auth: "admin",
  });
},

  async adminUserSetActivityTimes(userId, payload) {
    return await request(`/admin/users/${userId}/activity-times`, {
      method: "POST",
      auth: "admin",
      body: JSON.stringify(payload || {}),
    });
  },

  /* -----------------
   * Admin Admins (superadmin only)
  ----------------- */
  async adminListAdmins() {
    return await request("/admin/admins", { method: "GET", auth: "admin" });
  },

  async adminCreateAdmin(payload) {
    return await request("/admin/admins", {
      method: "POST",
      auth: "admin",
      body: JSON.stringify(payload || {}),
    });
  },

  async adminUpdateAdmin(id, patch) {
    return await request(`/admin/admins/${id}`, {
      method: "PATCH",
      auth: "admin",
      body: JSON.stringify(patch || {}),
    });
  },

  async adminRemoveAdmin(id) {
    return await request(`/admin/admins/${id}`, {
      method: "DELETE",
      auth: "admin",
    });
  },

  /* -----------------
   * Admin Winners
  ----------------- */
  async adminWinners(type = "all") {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    return await request(`/admin/winners${qs}`, { method: "GET", auth: "admin" });
  },

  /* -----------------
   * Admin Prize Settings
  ----------------- */
  async adminRedpacketGetConfig() {
    return await request("/admin/redpacket/config", { method: "GET", auth: "admin" });
  },

  async adminRedpacketSaveConfig(payload) {
    return await request("/admin/redpacket/config", {
      method: "POST",
      auth: "admin",
      body: JSON.stringify(payload || {}),
    });
  },

  async adminWheelPrizesList() {
    return await request("/admin/wheel/prizes", { method: "GET", auth: "admin" });
  },

  async adminWheelPrizesReplace(items) {
    return await request("/admin/wheel/prizes", {
      method: "PUT",
      auth: "admin",
      body: JSON.stringify({ prizes: Array.isArray(items) ? items : [] }),
    });
  },

  // ===== Promotions (Admin) =====
  adminPromotionsList: async () => {
    return await adminRequest("/admin/promotions");
  },
  adminPromotionsCreate: async (payload) => {
    return await adminRequest("/admin/promotions", { method: "POST", body: payload });
  },
  adminPromotionsUpdate: async (id, payload) => {
    return await adminRequest(`/admin/promotions/${id}`, { method: "PUT", body: payload });
  },
  adminPromotionsDelete: async (id) => {
    return await adminRequest(`/admin/promotions/${id}`, { method: "DELETE" });
  },
  adminPromotionsUpload: async (file) => {
    const token = getAdminToken();
    if (!token) return { success: false, error: "no admin token" };

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`${API_BASE}/admin/promotions/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    if (res.status === 401) {
      let msg = "Unauthorized";
      try {
        const j = await res.json();
        msg = j?.error || msg;
      } catch (_) {}
      return { success: false, error: msg, status: 401 };
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.error || msg;
      } catch (_) {}
      return { success: false, error: msg, status: res.status };
    }
    return await res.json();
  },
};