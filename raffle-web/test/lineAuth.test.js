import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ lineLogin: vi.fn(), lineRegister: vi.fn() }));
vi.mock('../src/api', () => ({ api }));
let auth, liff;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  sessionStorage.clear();
  liff = { init: vi.fn().mockResolvedValue(undefined), isLoggedIn: vi.fn().mockReturnValue(true), getIDToken: vi.fn().mockReturnValue('verified-id-token'), login: vi.fn() };
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

  it('rejects an absent ID token without sending an unauthenticated registration', async () => {
    liff.getIDToken.mockReturnValue(null);
    await expect(auth.startLineAuth('register')).rejects.toThrow('身分授權');
    expect(api.lineRegister).not.toHaveBeenCalled();
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
