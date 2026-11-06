import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { API_BASE } from '../src/config';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

it('uses credentialed server session handoff and preserves safe error codes', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, code: 'LINE_SESSION_INVALID', error: '登入連線已失效' }) });
  vi.stubGlobal('fetch', fetchMock);
  const result = await api.lineSession();
  expect(fetchMock.mock.calls[0][0]).toBe(API_BASE + '/auth/line/session');
  expect(result.code).toBe('LINE_SESSION_INVALID');
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  expect(fetchMock.mock.calls[0][1].body).toBe('{}');
});

it('aborts a stalled login request instead of leaving the button spinning', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  const pending = expect(api.lineSession()).rejects.toThrow('伺服器連線逾時');
  await vi.advanceTimersByTimeAsync(20000);
  await pending;
});
