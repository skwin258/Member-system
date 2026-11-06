import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({ token: '', me: vi.fn(), activities: vi.fn() }));
vi.mock('../src/api', () => ({
  api: { me: mock.me, activities: mock.activities }, getToken: () => mock.token,
  getAdminToken: () => '', setAdminToken: vi.fn(), clearAdminToken: vi.fn(),
  clearToken: vi.fn(), touchUserActivity: vi.fn(), isUserIdleExpired: () => false,
}));
vi.mock('../src/mobile/MobileShell.jsx', () => ({ default: ({ isGuest, me }) => <div>手機首頁{isGuest ? '訪客' : me?.user?.username}</div> }));
vi.mock('../src/pages/front/FrontShell.jsx', () => ({ default: ({ isGuest, me }) => <div>電腦首頁{isGuest ? '訪客' : me?.user?.username}</div> }));
vi.mock('../src/components/LoginPromotions.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/AdminDashboard.jsx', () => ({ default: () => null }));
vi.mock('../src/components/RegisterModal.jsx', () => ({ default: () => null }));
import MobileApp from '../src/MobileApp';
import App from '../src/App';
beforeEach(() => {
  mock.token = ''; vi.clearAllMocks();
  mock.activities.mockImplementation(() => new Promise(() => {}));
  mock.me.mockResolvedValue({ success: true, user: { username: 'member' } });
});
afterEach(cleanup);

for (const [Component, label] of [[MobileApp, '手機首頁'], [App, '電腦首頁']]) {
  it(`${label}: visitor sees homepage immediately even while activities are stalled`, () => {
    render(<Component/>);
    expect(screen.getByText(label + '訪客')).toBeTruthy();
    expect(mock.activities).toHaveBeenCalledTimes(1);
  });
  it(`${label}: verified member does not wait for a slow activities request`, async () => {
    mock.token = 'existing-session';
    render(<Component/>);
    await waitFor(() => expect(screen.getByText(label + 'member')).toBeTruthy());
    expect(mock.me).toHaveBeenCalledTimes(1);
  });
}
