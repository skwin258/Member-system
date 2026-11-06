import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { API_BASE } from '../src/config';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

it('uses the existing production API and preserves structured LINE error codes', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ success: false, code: 'LINE_NOT_REGISTERED', error: '尚未使用 LINE 註冊' }) });
  vi.stubGlobal('fetch', fetchMock);
  const result = await api.lineLogin({ id_token: 'test-only-token' });
  expect(fetchMock.mock.calls[0][0]).toBe(API_BASE + '/auth/line/login');
  expect(result.code).toBe('LINE_NOT_REGISTERED');
});

it('aborts a stalled login request instead of leaving the button spinning', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  const pending = expect(api.lineLogin({ id_token: 'test-only-token' })).rejects.toThrow('伺服器連線逾時');
  await vi.advanceTimersByTimeAsync(20000);
  await pending;
});
