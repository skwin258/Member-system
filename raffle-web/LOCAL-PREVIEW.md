# 本機預覽

在此 raffle-web 資料夾執行 npm ci（首次）及 npm run dev，開啟 http://localhost:5173/。

- 900px 以下或手機裝置：新版古埃及風手機版。
- 電腦版前台：保留原有介面。
- /admin：新版古埃及風後台，手機與電腦皆可使用。
- /admin?tab=loginPromotions：登入活動圖管理，支援多張 PNG、排序、啟用／停用、預覽與刪除。

前台預設連線至既有 `https://api.skclub.vip` API，由該 Worker 使用 `wrangler.jsonc` 設定的 `raffle_db` D1 資料庫。不是新資料庫；本機登入及操作也會使用既有正式資料。可用 `VITE_API_BASE` 覆寫為其他環境。登入活動圖沿用既有優惠 API 與 R2，不需新增後端部署。已關閉的圖片在同一登入階段重整不會重複出現。

LINE 使用現有公開 LIFF ID `2010170588-mETnmUii`，可用 `VITE_LINE_LIFF_ID` 覆寫。LINE 授權返回後會先完成登入再載入會員首頁，並保留推薦碼。LIFF 必須在 LINE Developers 設定的 HTTPS Endpoint 網址或其下層網址執行，因此正式 LINE 登入請在 `https://skclub.vip/` 實測；`localhost:5173` 可預覽網站與讀取 API，但不是這個正式 LIFF 的授權回呼網址。要在獨立測試站使用 LINE，請設定對應的測試 LIFF 與 HTTPS Endpoint。

登入連線與 SDK 初始化有逾時處理；授權取消或網路失敗會顯示可重試的錯誤，不會自動無限跳轉。只有後端明確回傳 `LINE_NOT_REGISTERED` 時，登入才會接續註冊，停用或鎖定帳號不會走註冊流程。

npm test 可執行活動圖模擬測試，不會連線寫入正式資料。
