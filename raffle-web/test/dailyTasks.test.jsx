import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DailyTasks from "../src/mobile/DailyTasks.jsx";

const mocks = vi.hoisted(() => ({
  dailyTasks: vi.fn(), uploadDailyTaskProof: vi.fn(), claimDailyTask: vi.fn(), claimDailySc: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: mocks }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows the six tasks, opens official LINE instructions, and submits Instagram proof", async () => {
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value() { this.open = true; },
  });
  const tasks = { instagram:"available", threads:"available", checkin:"approved", share_post:"available", like_post:"available", share_story:"available" };
  mocks.dailyTasks.mockResolvedValue({ success:true, tasks, progress:0 });
  mocks.uploadDailyTaskProof.mockResolvedValue({ success:true, tasks:{ ...tasks, instagram:"pending" }, progress:0 });
  mocks.claimDailyTask.mockResolvedValue({ success:true, tasks:{ ...tasks, instagram:"pending", checkin:"claimed" }, progress:1 });
  try {
    render(<DailyTasks onClose={() => {}} lineUrl="https://lin.ee/example" />);
    const action = (title, label) => within(screen.getByText(title).closest(".daily-task-row")).getByRole("button", { name:label });
    await waitFor(() => expect(action("點讚貼文", "前往").disabled).toBe(false));
    expect(screen.getByText("0/4")).toBeTruthy();
    for (const [task, message] of [["轉發貼文", "轉發"], ["點讚貼文", "點讚"], ["轉發限動", "限動"]]) {
      fireEvent.click(action(task, "前往"));
      expect(screen.getByText(`請私訊官方 LINE「我要${message}」`)).toBeTruthy();
      expect(screen.getByRole("link", { name:"前往官方 LINE" }).href).toBe("https://lin.ee/example");
      fireEvent.click(screen.getByRole("button", { name:"關閉說明" }));
    }
    fireEvent.click(action("驗證 Instagram", "前往"));
    const file = new File(["sample"], "proof.png", { type:"image/png" });
    fireEvent.change(screen.getByLabelText("選擇檔案"), { target:{ files:[file] } });
    fireEvent.submit(screen.getByRole("button", { name:"送出" }).closest("form"));
    await screen.findByText("已送出，請等候審核");
    expect(mocks.uploadDailyTaskProof).toHaveBeenCalledWith("instagram", file);
    expect(action("驗證 Instagram", "審核中").disabled).toBe(true);
    fireEvent.click(action("每日簽到", "領取"));
    await screen.findByText("1/4");
    expect(mocks.claimDailyTask).toHaveBeenCalledWith("checkin");
  } finally {
    cleanup();
    if (show) Object.defineProperty(HTMLDialogElement.prototype, "showModal", show);
    else delete HTMLDialogElement.prototype.showModal;
  }
});
