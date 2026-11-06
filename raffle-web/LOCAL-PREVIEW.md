# 本機預覽

在此 raffle-web 資料夾執行 npm ci（首次）及 npm run dev，開啟 http://localhost:5173/。

- 900px 以下或手機裝置：新版古埃及風手機版。
- 電腦版前台：保留原有介面。
- /admin：新版古埃及風後台，手機與電腦皆可使用。
- /admin?tab=loginPromotions：登入活動圖管理，支援多張 PNG、排序、啟用／停用、預覽與刪除。

前台預設連線至既有 `https://api.skclub.vip` API，由該 Worker 使用 `wrangler.jsonc` 設定的 `raffle_db` D1 資料庫。不是新資料庫；本機登入及操作也會使用既有正式資料。可用 `VITE_API_BASE` 覆寫為其他環境。登入活動圖沿用既有優惠 API 與 R2，不需新增後端部署。已關閉的圖片在同一登入階段重整不會重複出現。

LINE 登入／註冊已改為後端 OAuth Code 流程，不再使用前端 LIFF Token。本機及區網網站的 LINE 按鈕會前往正式 HTTPS 站完成授權，不會把會員 Session 傳回 HTTP 區網網址。Callback 與 Secret 的必要設定、部署順序及驗收步驟見專案根目錄 `LINE-LOGIN-REPAIR.md`。前後端需成套更新。

npm test 可執行活動圖模擬測試，不會連線寫入正式資料。
