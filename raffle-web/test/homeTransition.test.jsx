import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MobileShell from "../src/mobile/MobileShell.jsx";

vi.mock("../src/api", () => ({
  api: { homeBanners: async () => ({ success: true, items: [] }) },
  getToken: () => "",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps the artwork visible while the destination mounts, then removes it after fading", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const { container } = render(<MobileShell isGuest />);
  const tile = screen.getByRole("link", { name: "進入奪寶" });
  tile.getBoundingClientRect = () => ({ top: 390, left: 64, width: 280, height: 230 });
  fireEvent.click(tile);
  const artwork = container.querySelector(".fh-route-zoom");
  expect(artwork).toBeTruthy();
  expect(tile.style.visibility).toBe("hidden");
  expect(container.querySelector(".arcade-frame")).toBeNull();
  fireEvent.animationEnd(artwork);
  expect(container.querySelector(".arcade-frame")).toBeTruthy();
  expect(container.querySelector(".fh-route-fade")).toBe(artwork);
  fireEvent.animationEnd(artwork);
  expect(container.querySelector(".fh-route-transition")).toBeNull();
});

it("opens the page directly when reduced motion is enabled", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { container } = render(<MobileShell isGuest />);
  fireEvent.click(screen.getByRole("link", { name: "進入奪寶" }));
  expect(container.querySelector(".arcade-frame")).toBeTruthy();
  expect(container.querySelector(".fh-route-transition")).toBeNull();
});
