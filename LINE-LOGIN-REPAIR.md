# LINE 登入與註冊修復（2026-11-07）

## 已確認的事實與限制

- 正式站 `skclub.vip` 的公開前端與 Worker 設定都使用 Channel ID `2010170588`；舊 LIFF ID 為 `2010170588-mETnmUii`。前綴一致不能證明 LINE Developers 後台全部設定正確。
- 使用者在正式站 Safari／Chrome 遇到 400，不能歸因於區網網址。乾淨瀏覽器測試舊正式站可進入 LINE 登入頁，沒有穩定重現該 400；仍需核對後台設定與發生錯誤當下的環境。
- 舊版 `liff.isLoggedIn()` 為真時直接重用 `getIDToken()`，初始化 Promise 也會沿用；沒有重新授權恢復機制。截圖的 `IdToken expired.` 與此程式路徑一致。
- 舊 Worker 使用 LINE 官方 ID Token 驗證端點，並不是只解碼 JWT 就相信內容。但原始錯誤會直接傳到登入介面，且沒有本站獨立的 state／nonce 驗證。
- 第二張截圖的 `intent://` handler 錯誤代表環境無法開啟 LINE App；它不是 400 或 Token 過期的直接證據。

## 新流程與修改範圍

1. 原登入／註冊按鈕導向 `https://api.skclub.vip/auth/line/start`。
2. Worker 生成隨機 state、nonce、PKCE verifier；以 HttpOnly、Secure、SameSite=Lax Cookie 綁定同一瀏覽器。D1 只新增 `line_oauth_flows` 暫存表，state／handoff 只儲存雜湊，限時且一次性消耗。
3. LINE 授權參數固定為 `response_type=code`、`client_id=2010170588`、`scope=openid profile`、固定 Callback、state、nonce、PKCE S256。`disable_auto_login=true` 避免依賴 App intent 跳轉。
4. Callback 在後端驗證 state、Cookie、期限與重放狀態，再交換 Authorization Code。交換使用相同的 `redirect_uri`、後端 Channel Secret 及 PKCE verifier。
5. 後端向 LINE 官方驗證端點驗證 ID Token 簽章，再檢查 `iss`、`aud`、`exp`、`iat`、`nonce`。LINE Access Token、ID Token、Channel Secret 不傳到前端、不寫入 URL 或本地儲存、不回傳原始 LINE 回應。
6. 沿用原會員查找／註冊／推薦綁定與網站 Session 建立函式；已有 `line_user_id` 的會員沿用原帳號、密碼、姓名與餘額。網站 Session 仍沿用既有 Bearer Token 與 10 分鐘閒置機制，沒有改動其他功能。
7. 網站以同站跨子網域、帶憑證的 POST 取得一次性的網站 Session。這一步只允許 Origin `https://skclub.vip`，不使用跨站第三方 Cookie；重複 Callback 不會重複交換。
8. 過期或取消顯示中文提示與「重新進行 LINE 授權」。重新授權會建立全新的 state／nonce／Code，不重送舊 Token，不無限重試。

前端 Token 限制是針對 LINE Token；網站原有 Session Token 仍供現有 API 使用，以避免改動其他功能。登入、註冊介面的原有樣式不變。

主要檔案：`src/line-oauth.js`、`src/index.js`、`wrangler.jsonc`、`raffle-web/src/lib/lineAuth.js`、`raffle-web/src/components/LineAuthCallback.jsx`、`raffle-web/src/api.js`、`raffle-web/index.html`、`raffle-web/src/config.js`。

## 上線前必需的後台設定

1. [LINE Developers Console](https://developers.line.biz/console/) → 既有 Provider → **既有 LINE Login Channel `2010170588`** → **LINE Login** 分頁 → **Callback URL**：新增以下完整一行，保留其他仍使用中的網址，不要多尾斜線：

   `https://api.skclub.vip/auth/line/callback`

2. 同 Channel 的 **Basic settings**：確認 Channel ID `2010170588`。將該 Channel 的 **Channel secret** 直接填入 Cloudflare Secret，不能使用 Messaging API Channel Secret 或 Channel Access Token。
3. Cloudflare → **Workers & Pages → raffle-api → Settings → Variables and Secrets → Add**：Type 選 **Secret**，Name 為 `LINE_LOGIN_CHANNEL_SECRET`，Value 為上述 Channel secret。不要把值貼入聊天、前端 `.env`、截圖或 Git。
4. `wrangler.jsonc` 已設定公開變數：

   - `LINE_LOGIN_CHANNEL_ID=2010170588`
   - `LINE_LOGIN_REDIRECT_URI=https://api.skclub.vip/auth/line/callback`
   - `LINE_LOGIN_FRONTEND_URL=https://skclub.vip/`

5. 正式提供一般會員使用時，確認 Channel 已 Published，Web app 設定正確。舊 LIFF App／Endpoint 不需刪除；新版登入不再依賴 LIFF。
6. 部署順序：設定 Callback／Secret → 部署 Worker → 驗證新的授權網址能進入 LINE 登入頁 → 部署前端。前端與後端需成套更新。

## 自動測試與結果

- `node --test --test-isolation=none test/line-oauth.test.mjs`：8 項通過。使用獨立 SQLite 記憶體資料庫及模擬 LINE 回應，沒有讀寫正式會員資料。
- `raffle-web` 下 `npm test`：20 項通過，含活動圖既有測試，沒有呼叫正式登入端點。
- `npm run build`：成功；新增前端登入程式靜態檢查通過。
- Worker `wrangler deploy --dry-run`：成功。這是打包檢查，不能當成正式部署完成。
- 測試覆蓋正確授權參數、Code 交換、PKCE／nonce、錯誤簽章、錯誤 issuer／audience／期限、state／Cookie 不符、過期 state、重放、取消、過期 Token 安全提示、網站 Session 一次性交付、CORS、React StrictMode 去重、既有會員資料保留、新會員及推薦綁定。
- 真實手機 Safari／Chrome／Telegram 的登入與 Callback 後台設定仍須在部署後實測；模擬測試不能取代使用者本人 LINE 授權。

## 部署後手動驗收

1. Safari／Chrome 用新分頁開 `https://skclub.vip/`，點原「LINE登入／註冊」。應進入 LINE HTTPS 登入頁，不出現 400，也不依賴 `intent://`。
2. 用既有 LINE 會員登入，確認原會員 ID、餘額、推薦關係保留；重新整理後仍登入。不要用新增會員測試來替代既有會員驗收。
3. 經推薦連結使用新的 LINE 測試帳號註冊，確認只建立一位會員，推薦人正確。不要刪除既有帳號作測試。
4. 取消授權、等待授權超時、重整舊回呼網址，應顯示中文恢復提示；按「重新進行 LINE 授權」應產生全新授權，不重送舊 Token。
5. 查看前端 Network／URL／Storage：不得出現 LINE Channel Secret、LINE Access Token 或 ID Token。只應有網站自己的 Session Token。
6. 在 Telegram 開網站完成流程；若授權中途換到另一瀏覽器，應安全拒絕 Cookie／state 不符，改在 Safari／Chrome 開首頁並在同一瀏覽器完成。不要放寬 state 檢查來支援跨瀏覽器續接。
7. 本機／區網仍可預覽網站；LINE 按鈕會導向正式 HTTPS 網站完成授權，不把會員 Session 傳回區網 HTTP 網址。

## 官方依據

- https://developers.line.biz/en/docs/line-login/integrate-line-login/
- https://developers.line.biz/en/reference/line-login/#verify-id-token
- https://developers.line.biz/en/reference/liff/#login
