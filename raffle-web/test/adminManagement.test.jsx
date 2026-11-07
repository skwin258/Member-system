import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AdminShopPage from "../src/pages/admin/AdminShopPage.jsx";
import AdminUserControl from "../src/pages/admin/AdminUserControl.jsx";

const mocks = vi.hoisted(() => ({
  adminListUsers: vi.fn(),
  adminGetUser: vi.fn(),
  adminUserWalletLogs: vi.fn(),
  adminUserOrders: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: mocks, getAdminToken: () => "test-admin", clearAdminToken: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
  expect(screen.getAllByText("讀取中…")).toHaveLength(2);
  await act(async () => finishLogs({ success: true, items: [] }));
  await waitFor(() => expect(screen.getAllByText("讀取中…")).toHaveLength(1));
});
