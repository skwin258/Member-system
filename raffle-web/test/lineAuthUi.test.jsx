import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const flow = vi.hoisted(() => ({ startLineAuth: vi.fn(), completeLineCallback: vi.fn(), isLineCallback: vi.fn(), clearLineCallback: vi.fn(), restartLineAuth: vi.fn() }));
vi.mock('../src/lib/lineAuth', () => flow);
import LoginBox from '../src/LoginBox';
import LineAuthCallback from '../src/components/LineAuthCallback';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); flow.isLineCallback.mockReturnValue(false); });
afterEach(cleanup);

it('the callback error button starts fresh authorization instead of replaying the failed code', async () => {
  flow.isLineCallback.mockReturnValue(true);
  flow.completeLineCallback.mockRejectedValue(new Error('LINE 授權連線已失效'));
  render(<LineAuthCallback><div>首頁</div></LineAuthCallback>);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '重新登入' }));
  expect(flow.restartLineAuth).toHaveBeenCalledTimes(1);
  expect(flow.completeLineCallback).toHaveBeenCalledTimes(1);
});

it('sends one login for rapid double clicks and shows network errors inline', async () => {
  let reject;
  flow.startLineAuth.mockReturnValue(new Promise((_resolve, failure) => { reject = failure; }));
  render(<LoginBox referralCode="friend123"/>);
  const button = screen.getByRole('button', { name: 'LINE登入 / 註冊' });
  fireEvent.click(button); fireEvent.click(button);
  expect(flow.startLineAuth).toHaveBeenCalledExactlyOnceWith('login', 'friend123');
  reject(new Error('伺服器連線逾時'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '伺服器連線逾時');
  expect(screen.getByRole('button', { name: 'LINE登入 / 註冊' }).disabled).toBe(false);
});

it('uses the supplied referral code for explicit LINE registration', async () => {
  flow.startLineAuth.mockResolvedValue(null);
  render(<LoginBox defaultView="register" referralCode="friend123"/>);
  fireEvent.click(screen.getByRole('button', { name: '使用 LINE 註冊' }));
  await waitFor(() => expect(flow.startLineAuth).toHaveBeenCalledExactlyOnceWith('register', 'friend123'));
});

it('resumes a mobile callback without opening the login modal and allows recovery on failure', async () => {
  flow.isLineCallback.mockReturnValue(true);
  flow.completeLineCallback.mockRejectedValue(new Error('LINE 授權未完成'));
  flow.clearLineCallback.mockReturnValue('/');
  render(<StrictMode><LineAuthCallback><div>會員首頁</div></LineAuthCallback></StrictMode>);
  expect(screen.queryByText('會員首頁')).toBeNull();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'LINE 授權未完成');
  fireEvent.click(screen.getByRole('button', { name: '返回首頁' }));
  expect(screen.getByText('會員首頁')).toBeTruthy();
});
