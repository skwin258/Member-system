import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AdminShopPage from "../src/pages/admin/AdminShopPage.jsx";
import AdminUserControl from "../src/pages/admin/AdminUserControl.jsx";
import AdminHomeBanners from "../src/pages/admin/AdminHomeBanners.jsx";
import FantasyHome from "../src/mobile/FantasyHome.jsx";

const mocks = vi.hoisted(() => ({
  adminListUsers: vi.fn(),
  adminGetUser: vi.fn(),
  adminUserWalletLogs: vi.fn(),
  adminUserOrders: vi.fn(),
  adminDailyTasks: vi.fn(async () => ({ success: true, items: [] })),
  homeBanners: vi.fn(),
  adminUploadBanner: vi.fn(),
  adminCreateBanner: vi.fn(),
  adminSaveBanner: vi.fn(),
  adminDeleteBanner: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: mocks, getAdminToken: () => "test-admin", clearAdminToken: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("changes a banner image and clears its link independently", async () => {
  mocks.homeBanners.mockResolvedValue({ success: true, items: [{ slot: 2, link_url: "https://example.com/" }] });
  mocks.adminUploadBanner.mockResolvedValue({ success: true, url: "/r2/banner/new.png" });
  mocks.adminSaveBanner.mockResolvedValue({ success: true, item: { slot: 2, image_url: "/r2/banner/new.png", link_url: "" } });
  render(<AdminHomeBanners />);
  const link = (await screen.findAllByLabelText("跳轉連結"))[1];
  fireEvent.change(link, { target: { value: "" } });
  const file = new File(["banner"], "new.png", { type: "image/png" });
  fireEvent.change(screen.getAllByLabelText("更換圖片")[1], { target: { files: [file] } });
  fireEvent.click(screen.getAllByRole("button", { name: "儲存 Banner" })[1]);
  await screen.findByText("已儲存");
  expect(mocks.adminUploadBanner).toHaveBeenCalledWith(file);
  expect(mocks.adminSaveBanner).toHaveBeenCalledWith(2, { image_url: "/r2/banner/new.png", link_url: "" });
  expect(screen.getByAltText("目前的 Banner 2").src).toMatch(/\/r2\/banner\/new\.png$/);
});

it("removes a default banner through the admin editor", async () => {
  mocks.homeBanners.mockResolvedValue({ success: true, items: [] });
  mocks.adminDeleteBanner.mockResolvedValue({ success: true, item: { slot: 1, deleted: true, link_url: "" } });
  vi.stubGlobal("confirm", () => true);
  render(<AdminHomeBanners />);
  fireEvent.click((await screen.findAllByRole("button", { name: "刪除 Banner" }))[0]);
  await screen.findByText("已刪除");
  expect(mocks.adminDeleteBanner).toHaveBeenCalledWith(1);
  expect(screen.queryByAltText("目前的 Banner 1")).toBeNull();
  expect(screen.getByText("3 / 9 張")).toBeTruthy();
});

it("adds a ninth banner with an optional link and disables further additions", async () => {
  mocks.homeBanners.mockResolvedValue({
    success: true, items: [5, 6, 7, 8].map(slot => ({ slot, image_url: "/r2/banner/existing.png" })),
  });
  mocks.adminUploadBanner.mockResolvedValue({ success: true, url: "/r2/banner/new.png" });
  mocks.adminCreateBanner.mockResolvedValue({
    success: true, item: { slot: 9, sort: 14, image_url: "/r2/banner/new.png", link_url: "" },
  });
  render(<AdminHomeBanners />);
  const add = await screen.findByRole("button", { name: "新增 Banner" });
  fireEvent.click(add);
  const file = new File(["banner"], "new.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("上傳圖片"), { target: { files: [file] } });
  fireEvent.click(screen.getAllByRole("button", { name: "儲存 Banner" }).at(-1));
  await screen.findByText("9 / 9 張");
  expect(mocks.adminCreateBanner).toHaveBeenCalledWith({ image_url: "/r2/banner/new.png", link_url: "" });
  expect(add.disabled).toBe(true);
});

it("omits deleted default banners and suppresses navigation after swiping a linked banner", async () => {
  mocks.homeBanners.mockResolvedValue({ success: true, items: [{ slot: 1, link_url: "/welcome" }, { slot: 3, deleted: true }, { slot: 9, sort: 14, image_url: "/r2/banner/extra.png" }] });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const animations = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "getAnimations");
  Object.defineProperty(HTMLImageElement.prototype, "getAnimations", { configurable: true, value: () => [] });
  const view = render(<FantasyHome isGuest />);
  try {
    const link = await screen.findByRole("link", { name: "活動 Banner 1" });
    expect(link.getAttribute("href")).toBe("/welcome");
    expect(screen.getByAltText("活動 Banner 2").closest("a")).toBeNull();
    expect(screen.queryByAltText("活動 Banner 3")).toBeNull();
    expect(view.container.querySelector(".fh-banner-track").lastElementChild.alt).toBe("活動 Banner 9");
    const viewport = view.container.querySelector(".fh-banner-window");
    viewport.setPointerCapture = vi.fn();
    function pointer(target, type, x) {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: 20 });
      target.dispatchEvent(event);
    }
    pointer(link, "pointerdown", 100);
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
    pointer(link, "pointermove", 20);
    pointer(link, "pointerup", 20);
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(1);
    expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))).toBe(false);
    expect(screen.getByRole("button", { name: "第 2 張 Banner" }).getAttribute("aria-current")).toBe("true");
  } finally {
    view.unmount();
    if (animations) Object.defineProperty(HTMLImageElement.prototype, "getAnimations", animations);
    else delete HTMLImageElement.prototype.getAnimations;
  }
});

it("edits a hidden product, saves the uploaded image, and deletes the checked products", async () => {
  const product = { id: "a", name: "隱藏商品", category: "現金", enabled: 0, reward_welfare: 20 };
  const second = { ...product, id: "b", name: "第二件" };
  const fetch = vi.fn(async (url, options) => {
    let data = { success: true };
    if (url.endsWith("/admin/shop/products")) data.items = [product, second];
    if (url.endsWith("/upload")) {
      expect(options.headers["Content-Type"]).toBeUndefined();
      expect(options.body.get("file").name).toBe("product.png");
      data.url = "/r2/shop/product.png";
    }
    if (url.endsWith("/products/a")) {
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body)).toMatchObject({ reward_welfare: 20, enabled: 0, image_url: "/r2/shop/product.png" });
    }
    if (url.endsWith("/batch-delete")) {
      expect(JSON.parse(options.body).ids).toEqual(["a", "b"]);
      data.deleted = 2;
    }
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("confirm", () => true);
  const view = render(<AdminShopPage />);
  fireEvent.click(screen.getByRole("button", { name: "商品管理" }));
  fireEvent.click((await screen.findAllByRole("button", { name: "編輯" }))[0]);
  expect(screen.getByLabelText("福利金").value).toBe("20");
  const photo = new File(["png"], "product.png", { type: "image/png" });
  fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [photo] } });
  fireEvent.click(screen.getByRole("button", { name: "儲存商品" }));
  await screen.findByText("已更新商品");
  fireEvent.click(screen.getByRole("checkbox", { name: "選取 隱藏商品" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "選取 第二件" }));
  fireEvent.click(screen.getByRole("button", { name: /批量刪除/ }));
  await screen.findByText("已刪除 2 件商品");
  expect(screen.queryByRole("checkbox")).toBeNull();
});

it("shows member details while wallet and order history are still loading", async () => {
  mocks.adminListUsers.mockResolvedValueOnce({ success: true, items: [{ id: 2, username: "second" }], next_before: 2 })
    .mockResolvedValueOnce({ success: true, items: [{ id: 1, username: "first" }], next_before: null });
  mocks.adminGetUser.mockResolvedValue({ success: true, user: { id: 2, username: "second" } });
  let finishLogs;
  mocks.adminUserWalletLogs.mockReturnValue(new Promise(resolve => { finishLogs = resolve; }));
  mocks.adminUserOrders.mockReturnValue(new Promise(() => {}));
  render(<AdminUserControl />);
  fireEvent.click(await screen.findByRole("button", { name: "載入更多使用者" }));
  await screen.findByRole("button", { name: /first/ });
  expect(mocks.adminListUsers).toHaveBeenLastCalledWith("", { limit: 50, before: 2 });
  fireEvent.click(screen.getByRole("button", { name: /second/ }));
  await screen.findByText("基本資料");
  expect(screen.getAllByRole("cell", { name: "讀取中…" })).toHaveLength(2);
  await act(async () => finishLogs({ success: true, items: [] }));
  await waitFor(() => expect(screen.getAllByRole("cell", { name: "讀取中…" })).toHaveLength(1));
});

it("shows the unread count on the signed-in notification bell and keeps logout separate", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  mocks.homeBanners.mockResolvedValue({ success: true, items: [] });
  const onNotifications = vi.fn();
  const onLogout = vi.fn();
  const { rerender } = render(<FantasyHome isGuest={false} unreadNotifications={2}
    onNotifications={onNotifications} onLogout={onLogout} />);
  const bell = screen.getByRole("button", { name: "通知，2 則未讀" });
  expect(bell.querySelector("svg")).not.toBeNull();
  expect(bell.textContent).toBe("2");
  fireEvent.click(bell);
  fireEvent.click(screen.getByRole("button", { name: "登出" }));
  expect(onNotifications).toHaveBeenCalledOnce();
  expect(onLogout).toHaveBeenCalledOnce();
  rerender(<FantasyHome isGuest />);
  expect(screen.getByRole("button", { name: "登入" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "註冊" })).toBeTruthy();
});
