const GAMES = new Set(["numbers", "reaction"]);
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function settings(env) {
  const sitekey = env.ARCADE_TURNSTILE_SITEKEY;
  const secret = env.ARCADE_TURNSTILE_SECRET;
  const hostname = env.ARCADE_TURNSTILE_HOST || "api.skclub.vip";
  if (!/^[a-zA-Z0-9_-]+$/.test(sitekey || "") || !secret) return null;
  return { sitekey, secret, hostname };
}

export function arcadeChallengePage(url, env) {
  const config = settings(env);
  const game = url.searchParams.get("game");
  if (!config || !GAMES.has(game) || url.hostname !== config.hostname) {
    return new Response("驗證服務尚未開放。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const action = "arcade_" + game;
  return new Response(`<!doctype html>
    <html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>遊戲安全驗證</title>
    <style>body{margin:8px;color:#ffedc7;background:#101a2d;font:14px system-ui;text-align:center}</style>
    <div id="widget"></div><p id="status" role="status">正在載入驗證…</p>
    <script>
      function renderChallenge() {
        const status = document.getElementById('status');
        status.textContent = '請完成驗證以開始這一局。';
        turnstile.render('#widget', {
          sitekey: '${config.sitekey}', action: '${action}', theme: 'dark', size: 'compact',
          callback: token => window.parent.postMessage({ type: 'skclub-arcade-proof', token }, '*'),
          'error-callback': () => { status.textContent = '驗證無法載入，請關閉後重試。'; }
        });
      }
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=renderChallenge&render=explicit" async defer></script>
    </html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function verifyArcadePreparation(request, env, game, token, verifyFetch = fetch) {
  if (!env.ARCADE_TURNSTILE_SITEKEY && !env.ARCADE_TURNSTILE_SECRET) return null;
  const config = settings(env);
  if (!config) return { status: 503, error: "遊戲安全驗證尚未開放。" };
  if (typeof token !== "string" || !token || token.length > 2048) {
    return { status: 428, error: "請先完成遊戲安全驗證。" };
  }
  try {
    const response = await verifyFetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: config.secret, response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || undefined,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { status: 503, error: "驗證服務暫時無法連線，請稍後重試。" };
    const proof = await response.json();
    if (proof.success === true && proof.hostname === config.hostname && proof.action === "arcade_" + game) return null;
    return { status: 428, error: "驗證已失效，請重新驗證。" };
  } catch {
    return { status: 503, error: "驗證服務暫時無法連線，請稍後重試。" };
  }
}
