import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ lineSession: vi.fn() }));
vi.mock('../src/api', () => ({ api }));
let auth, assign;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear();
  assign = vi.fn();
  vi.stubGlobal('window', { location: { href: 'https://skclub.vip/', assign } });
  api.lineSession.mockResolvedValue({ success: true, token: 'website-session' });
  auth = await import('../src/lib/lineAuth');
});
afterEach(() => vi.unstubAllGlobals());
it('starts HTTPS backend authorization with mode/referral and never reads LIFF tokens', async () => {
  window.location.href = 'http://192.168.1.136:5173/';
  await auth.startLineAuth('register', 'friend123');
  const url = new URL(assign.mock.calls[0][0]);
  expect(url.origin).toBe('https://api.skclub.vip');
  expect(url.pathname).toBe('/auth/line/start');
  expect(url.searchParams.get('mode')).toBe('register');
  expect(url.searchParams.get('ref')).toBe('friend123');
  expect(url.searchParams.has('redirect_uri')).toBe(false);
  expect(api.lineSession).not.toHaveBeenCalled();
});
it('deduplicates StrictMode callback exchanges', async () => {
  window.location.href = 'https://skclub.vip/?line_auth=complete';
  await Promise.all([auth.completeLineCallback(), auth.completeLineCallback()]);
  expect(api.lineSession).toHaveBeenCalledTimes(1);
});
it('shows friendly expired-token guidance without repeating the handoff', async () => {
  window.location.href = 'https://skclub.vip/?line_auth=error&line_error=LINE_TOKEN_EXPIRED';
  await expect(auth.completeLineCallback()).rejects.toThrow('重新進行授權');
  expect(api.lineSession).not.toHaveBeenCalled();
  await auth.startLineAuth();
  expect(assign).toHaveBeenCalledTimes(1);
});
it('fails closed for old LIFF callbacks and does not resubmit cached credentials', async () => {
  window.location.href = 'https://skclub.vip/?sk_line_auth=login&code=old-code';
  expect(auth.isLineCallback()).toBe(true);
  await expect(auth.completeLineCallback()).rejects.toThrow('流程已更新');
  expect(api.lineSession).not.toHaveBeenCalled();
});
it('never displays raw provider or unknown server errors', async () => {
  window.location.href = 'https://skclub.vip/?line_auth=complete';
  api.lineSession.mockResolvedValue({ success: false, error: 'IdToken expired.', code: 'unexpected-code' });
  await expect(auth.completeLineCallback()).rejects.toThrow('LINE 服務');
});
it('does not automatically authorize on regular visits and clears old auth state on success', () => {
  expect(auth.isLineCallback()).toBe(false);
  window.location.href = 'https://skclub.vip/?line_auth=complete&campaign=hello';
  sessionStorage.setItem('sk_line_auth_pending', 'old-state');
  expect(auth.clearLineCallback()).toBe('/?campaign=hello');
  expect(sessionStorage.getItem('sk_line_auth_pending')).toBeNull();
});
it('network failure does not replay a consumed one-time handoff', async () => {
  window.location.href = 'https://skclub.vip/?line_auth=complete';
  api.lineSession.mockRejectedValue(new Error('network error'));
  await expect(auth.completeLineCallback()).rejects.toThrow('稍後重新登入');
  await expect(auth.completeLineCallback()).rejects.toThrow('稍後重新登入');
  expect(api.lineSession).toHaveBeenCalledTimes(1);
});
