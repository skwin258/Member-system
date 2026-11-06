# 本機預覽

在此 raffle-web 資料夾執行 npm ci（首次）及 npm run dev，開啟 http://localhost:5173/。

- 900px 以下或手機裝置：新版古埃及風手機版。
- 電腦版前台：保留原有介面。
- /admin：新版古埃及風後台，手機與電腦皆可使用。
- /admin?tab=loginPromotions：登入活動圖管理，支援多張 PNG、排序、啟用／停用、預覽與刪除。

前台 API 沿用專案 VITE_API_BASE 設定，沒有複製 5174 的 .env.local。登入活動圖沿用既有優惠 API 與 R2，不需新增後端部署。已關閉的圖片在同一登入階段重整不會重複出現。

npm test 可執行活動圖模擬測試，不會連線寫入正式資料。
