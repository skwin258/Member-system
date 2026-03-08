import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./App.css";
import App from "./App.jsx";
import MobileApp from "./MobileApp.jsx";

function isAdminPath() {
  const p = window.location.pathname || "/";
  const h = window.location.hash || "";
  if (p.toLowerCase().startsWith("/admin")) return true;
  if (h.toLowerCase().startsWith("#/admin")) return true;
  return false;
}

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  const isMobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

  const isSmallScreen = window.innerWidth <= 900;

  return isMobileUA || isSmallScreen;
}

function pickRootApp() {
  if (isAdminPath()) return App; // 後台永遠走原本桌機版
  if (isMobileDevice()) return MobileApp; // 手機走手機版
  return App; // 桌機走原本版
}

const RootApp = pickRootApp();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <RootApp />
    </BrowserRouter>
  </StrictMode>
);