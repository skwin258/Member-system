import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ lineLogin: vi.fn(), lineRegister: vi.fn() }));
vi.mock('../src/api', () => ({ api }));
let auth, liff;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  sessionStorage.clear();
  liff = { init: vi.fn().mockResolvedValue(undefined), isLoggedIn: vi.fn().mockReturnValue(true), getIDToken: vi.fn().mockReturnValue('verified-id-token'), login: vi.fn(), logout: vi.fn(), isInClient: vi.fn().mockReturnValue(false) };
  vi.stubGlobal('window', { location: new URL('https://skclub.vip/'), liff });
  api.lineLogin.mockResolvedValue({ success: true, token: 'session' });
  api.lineRegister.mockResolvedValue({ success: true, token: 'session' });
  auth = await import('../src/lib/lineAuth');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LINE authorization return', () => {
  it('persists mode and referral through a fresh external-browser login', async () => {
    liff.isLoggedIn.mockReturnValue(false);
    expect(await auth.startLineAuth('register', 'abc12345')).toBeNull();
    const redirect = new URL(liff.login.mock.calls[0][0].redirectUri);
    expect(redirect.searchParams.get('sk_line_auth')).toBe('register');
    expect(redirect.searchParams.get('sk_line_ref')).toBe('abc12345');
    expect(api.lineRegister).not.toHaveBeenCalled();
    // Simulate the page loading again after LINE redirects back.
    vi.resetModules();
    window.location = redirect;
    liff.isLoggedIn.mockReturnValue(true);
    auth = await import('../src/lib/lineAuth');
    expect(auth.isLineCallback()).toBe(true);
    await auth.completeLineCallback();
    expect(api.lineRegister).toHaveBeenCalledExactlyOnceWith({ id_token: 'verified-id-token', referral_code: 'abc12345' });
  });

  it('completes once even when React StrictMode starts the callback twice', async () => {
    window.location = new URL('https://skclub.vip/?sk_line_auth=login&code=oauth-code');
    await Promise.all([auth.completeLineCallback(), auth.completeLineCallback()]);
    expect(liff.init).toHaveBeenCalledTimes(1);
    expect(api.lineLogin).toHaveBeenCalledTimes(1);
  });

  it('keeps intent from liff.state before SDK rewrites the URL, without session storage', async () => {
    window.location = new URL('https://skclub.vip/?liff.state=' + encodeURIComponent('/?sk_line_auth=register&sk_line_ref=friend123'));
    liff.init.mockImplementation(async () => { window.location = new URL('https://skclub.vip/'); });
    expect(auth.isLineCallback()).toBe(true);
    await auth.completeLineCallback();
    expect(api.lineRegister).toHaveBeenCalledWith({ id_token: 'verified-id-token', referral_code: 'friend123' });
  });

  it('registers a new LINE member using the backend error code', async () => {
    api.lineLogin.mockResolvedValue({ success: false, code: 'LINE_NOT_REGISTERED', error: '尚未使用 LINE 註冊' });
    await auth.startLineAuth('login', 'friend123');
    expect(api.lineRegister).toHaveBeenCalledWith({ id_token: 'verified-id-token', referral_code: 'friend123' });
  });

  it('does not create an account for a locked member or general server errors', async () => {
    api.lineLogin.mockResolvedValue({ success: false, error: '帳號已鎖定', status: 403 });
    await expect(auth.startLineAuth('login')).rejects.toThrow('帳號已鎖定');
    expect(api.lineRegister).not.toHaveBeenCalled();
  });

  it('does not redirect again if the callback authorization was cancelled', async () => {
    liff.isLoggedIn.mockReturnValue(false);
    await expect(auth.completeLineCallback()).rejects.toThrow('授權未完成');
    expect(liff.login).not.toHaveBeenCalled();
    expect(api.lineLogin).not.toHaveBeenCalled();
  });

  it('times out a stalled SDK and permits a subsequent retry', async () => {
    vi.useFakeTimers();
    liff.init.mockImplementationOnce(() => new Promise(() => {}));
    const stalled = expect(auth.startLineAuth()).rejects.toThrow('逾時');
    await vi.advanceTimersByTimeAsync(15000);
    await stalled;
    await auth.startLineAuth();
    expect(liff.init).toHaveBeenCalledTimes(2);
    expect(api.lineLogin).toHaveBeenCalledTimes(1);
  });

  it('renews an absent ID token without sending an unauthenticated registration', async () => {
    liff.getIDToken.mockReturnValue(null);
    expect(await auth.startLineAuth('register')).toBeNull();
    expect(liff.logout).toHaveBeenCalledTimes(1);
    expect(liff.login).toHaveBeenCalledTimes(1);
    expect(api.lineRegister).not.toHaveBeenCalled();
  });

  it('uses a clean production return URL instead of recycling old OAuth parameters or LAN URLs', async () => {
    window.location = new URL('http://192.168.1.136:5173/register/friend123?code=old-code&state=old-state&liff.state=old#access_token=old');
    liff.isLoggedIn.mockReturnValue(false);
    await auth.startLineAuth('register', 'friend123');
    const target = new URL(liff.login.mock.calls[0][0].redirectUri);
    expect(target.origin + target.pathname).toBe('https://skclub.vip/');
    expect([...target.searchParams.keys()]).toEqual(['sk_line_auth', 'sk_line_ref']);
    expect(target.hash).toBe('');
  });

  it('renews locally expired tokens before sending them to the backend', async () => {
    liff.getDecodedIDToken = vi.fn().mockReturnValue({ exp: Math.floor(Date.now()/1000) - 1 });
    expect(await auth.startLineAuth('login', 'friend123')).toBeNull();
    expect(api.lineLogin).not.toHaveBeenCalled();
    expect(liff.logout).toHaveBeenCalledTimes(1);
    const target = new URL(liff.login.mock.calls[0][0].redirectUri);
    expect(target.searchParams.get('sk_line_ref')).toBe('friend123');
    expect(target.searchParams.get('sk_line_retry')).toBe('1');
  });

  it('recovers from the actual legacy backend IdToken expired response with a fresh authorization', async () => {
    api.lineLogin.mockResolvedValue({ success: false, error: 'IdToken expired.', status: 401 });
    expect(await auth.startLineAuth()).toBeNull();
    expect(api.lineLogin).toHaveBeenCalledTimes(1);
    expect(liff.logout).toHaveBeenCalledTimes(1);
    expect(liff.login).toHaveBeenCalledTimes(1);
    expect(liff.init).toHaveBeenCalledTimes(2);
  });

  it('does not endlessly reauthorize if a fresh callback is still rejected', async () => {
    window.location = new URL('https://skclub.vip/?sk_line_auth=login&sk_line_retry=1');
    api.lineLogin.mockResolvedValue({ success: false, error: 'IdToken expired.' });
    await expect(auth.completeLineCallback()).rejects.toThrow('請返回首頁重新登入');
    expect(liff.login).not.toHaveBeenCalled();
  });

  it('hides a repeated expired-token error during SDK reinitialization', async () => {
    liff.init.mockRejectedValue(new Error('IdToken expired.'));
    await expect(auth.startLineAuth()).rejects.toThrow('請重新整理頁面後再登入');
    expect(api.lineLogin).not.toHaveBeenCalled();
  });

  it('does not automatically sign in normal homepage visits', () => {
    expect(auth.isLineCallback()).toBe(false);
    expect(liff.init).not.toHaveBeenCalled();
  });

  it('removes authorization parameters but preserves referral paths and unrelated query data', () => {
    window.location = new URL('https://skclub.vip/register/friend123?sk_line_auth=register&sk_line_ref=friend123&code=secret&state=secret&campaign=hello');
    expect(auth.clearLineCallback()).toBe('/register/friend123?campaign=hello');
  });
});
