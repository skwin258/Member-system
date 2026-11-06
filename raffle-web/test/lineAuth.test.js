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
  it('never processes a failed PKCE callback twice and restarts through a clean LIFF entry', async () => {
    window.location = new URL('https://skclub.vip/?sk_line_auth=register&sk_line_ref=friend123&code=used-code&state=old-state');
    liff.init.mockRejectedValue(new Error('code_verifier does not match'));
    await expect(auth.completeLineCallback()).rejects.toThrow('重新登入');
    await expect(auth.completeLineCallback()).rejects.toThrow('重新登入');
    expect(liff.init).toHaveBeenCalledTimes(1);
    expect(api.lineRegister).not.toHaveBeenCalled();
    auth.restartLineAuth();
    const target = new URL(window.location.href);
    expect(target.origin).toBe('https://liff.line.me');
    expect(target.searchParams.get('sk_line_start')).toBe('register');
    expect(target.searchParams.get('sk_line_ref')).toBe('friend123');
    expect(target.searchParams.has('code')).toBe(false);
    expect(target.searchParams.has('state')).toBe(false);
  });

  it('a double click never replaces the in-flight PKCE verifier with another login', async () => {
    liff.isLoggedIn.mockReturnValue(false);
    await Promise.all([auth.startLineAuth(), auth.startLineAuth()]);
    await auth.startLineAuth();
    expect(liff.init).toHaveBeenCalledTimes(1);
    expect(liff.login).toHaveBeenCalledTimes(1);
  });

  it('moves from a LAN origin before SDK initialization, then creates and consumes PKCE only on the production origin', async () => {
    const verifiers = new Map();
    let sequence = 0, loggedIn = false;
    liff.isLoggedIn.mockImplementation(() => loggedIn);
    liff.login.mockImplementation(() => { verifiers.set(window.location.origin, ++sequence); });
    liff.init.mockImplementation(async () => {
      const code = window.location.searchParams.get('code');
      if (code) {
        if (String(verifiers.get(window.location.origin)) !== code) throw new Error('code_verifier does not match');
        verifiers.delete(window.location.origin);
        loggedIn = true;
      }
    });
    window.location = new URL('http://192.168.1.136:5173/');
    await auth.startLineAuth('register', 'friend123');
    expect(liff.login).not.toHaveBeenCalled();
    expect(window.location.origin).toBe('https://skclub.vip');
    vi.resetModules();
    auth = await import('../src/lib/lineAuth');
    await auth.completeLineCallback();
    expect(liff.login).toHaveBeenCalledTimes(1);
    window.location = new URL('https://skclub.vip/?sk_line_auth=register&sk_line_ref=friend123&code=1');
    vi.resetModules();
    auth = await import('../src/lib/lineAuth');
    await Promise.all([auth.completeLineCallback(), auth.completeLineCallback()]);
    expect(api.lineRegister).toHaveBeenCalledExactlyOnceWith({ id_token: 'verified-id-token', referral_code: 'friend123' });
  });

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

  it('never starts a second uncancellable SDK init after a timeout', async () => {
    vi.useFakeTimers();
    liff.init.mockImplementationOnce(() => new Promise(() => {}));
    const stalled = expect(auth.startLineAuth()).rejects.toThrow('逾時');
    await vi.advanceTimersByTimeAsync(15000);
    await stalled;
    await expect(auth.startLineAuth()).rejects.toThrow('逾時');
    expect(liff.init).toHaveBeenCalledTimes(1);
    expect(api.lineLogin).not.toHaveBeenCalled();
    auth.restartLineAuth();
    expect(window.location.hostname).toBe('liff.line.me');
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
    const target = new URL(window.location.href);
    expect(target.origin + target.pathname).toBe('https://skclub.vip/');
    expect([...target.searchParams.keys()]).toEqual(['sk_line_start', 'sk_line_ref']);
    expect(target.hash).toBe('');
    expect(liff.init).not.toHaveBeenCalled();
    expect(liff.login).not.toHaveBeenCalled();
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
    expect(liff.init).toHaveBeenCalledTimes(1);
  });

  it('does not endlessly reauthorize if a fresh callback is still rejected', async () => {
    window.location = new URL('https://skclub.vip/?sk_line_auth=login&sk_line_retry=1');
    api.lineLogin.mockResolvedValue({ success: false, error: 'IdToken expired.' });
    await expect(auth.completeLineCallback()).rejects.toThrow('請返回首頁重新登入');
    expect(liff.login).not.toHaveBeenCalled();
  });

  it('leaves an expired callback document before any SDK reinitialization', async () => {
    liff.init.mockRejectedValue(new Error('IdToken expired.'));
    expect(await auth.startLineAuth()).toBeNull();
    expect(liff.init).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('sk_line_start=login');
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
