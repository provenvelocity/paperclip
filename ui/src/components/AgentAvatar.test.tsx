// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { appearanceForPalette } from "@paperclipai/shared";
import { AgentAvatar } from "./AgentAvatar";
import { AgentCharacter } from "./AgentCharacter";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shows the uploaded image in small and animated-character surfaces, then returns to the palette on reset", async () => {
  const base = appearanceForPalette("deep-tide");
  const appearance = { ...base, customAvatarAssetId: "22222222-2222-4222-8222-222222222222" };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<><AgentAvatar appearance={appearance} /><AgentCharacter appearance={appearance} /></>));
    for (const image of container.querySelectorAll("img")) {
      expect(image.getAttribute("src")).toBe("/api/assets/22222222-2222-4222-8222-222222222222/content");
      expect(image.hasAttribute("srcset")).toBe(false);
      expect(image.parentElement?.classList.contains("invisible")).toBe(false);
    }
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector(".agent-avatar-motion")).toBeNull();
    await act(async () => root.render(<AgentAvatar appearance={base} />));
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/api/agent-avatars/cap-v1/deep-tide/");
  } finally { await act(async () => root.unmount()); }
});

it("shares the single live-character slot and releases it when an animated avatar unmounts", async () => {
  const appearance = {
    ...appearanceForPalette("deep-tide"),
    customAvatarAssetId: "22222222-2222-4222-8222-222222222222",
    customAvatarMotion: "reactive" as const,
  };
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  vi.stubGlobal("IntersectionObserver", class implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds = [0];
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this);
    }
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<>
      <AgentCharacter key="first" appearance={appearance} label="First" />
      <AgentCharacter key="second" appearance={appearance} label="Second" />
    </>));
    expect(container.querySelectorAll(".agent-avatar-motion")).toHaveLength(1);
    expect(container.querySelector('[aria-label="First"] .agent-avatar-motion')).not.toBeNull();
    await act(async () => root.render(<>
      <AgentCharacter key="second" appearance={appearance} label="Second" />
    </>));
    expect(container.querySelectorAll(".agent-avatar-motion")).toHaveLength(1);
    expect(container.querySelector('[aria-label="Second"] .agent-avatar-motion')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("follows the mouse with bounded translation and tilt and cleans up tracking", async () => {
    const appearance = {
      ...appearanceForPalette("deep-tide"),
      customAvatarAssetId: "22222222-2222-4222-8222-222222222222",
      customAvatarMotion: "reactive" as const,
    };
    let intersect: IntersectionObserverCallback | undefined;
    const reduced = Object.assign(new EventTarget(), { matches: false });
    const coarse = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("matchMedia", (query: string) => query.includes("coarse") ? coarse : reduced);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {}
      disconnect() {}
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = async (trackingScope: "region" | "page" = "region", followCursor = true, followRotation = true) => {
      await act(async () => root.render(<AgentCharacter appearance={appearance} label="Mascot"
        trackingScope={trackingScope} followCursor={followCursor} followRotation={followRotation} />));
    };
    const pointer = (target: Element, pointerType = "mouse", clientX = 100000, clientY = 150) => {
      target.dispatchEvent(Object.assign(new Event("pointermove"), { pointerType, clientX, clientY }));
    };
    try {
      await render();
      const hero = container.querySelector<HTMLElement>('[aria-label="Mascot"]')!;
      vi.spyOn(hero, "getBoundingClientRect").mockReturnValue({
        left: 100, top: 100, width: 100, height: 100,
      } as DOMRect);
      await act(async () => intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      const target = container.querySelector<HTMLElement>(".agent-avatar-tracking")!;
      pointer(document.documentElement);
      expect(target.style.transform).toBe("");
      pointer(hero, "touch");
      expect(target.style.transform).toBe("");
      pointer(hero);
      expect(target.style.transform).toBe("perspective(600px) translate(4%, 0%) rotateX(0deg) rotateY(10deg)");
      hero.dispatchEvent(new Event("pointerleave"));
      expect(target.style.transform).toBe("");
      pointer(hero, "mouse", 150, -100000);
      expect(target.style.transform).toBe("perspective(600px) translate(0%, -4%) rotateX(8deg) rotateY(0deg)");
      await render("page", false, true);
      pointer(document.documentElement);
      expect(target.style.transform).toBe("perspective(600px) translate(0%, 0%) rotateX(0deg) rotateY(10deg)");
      await render("page", true, false);
      pointer(document.documentElement);
      expect(target.style.transform).toBe("perspective(600px) translate(4%, 0%) rotateX(0deg) rotateY(0deg)");
      await act(async () => { coarse.matches = true; coarse.dispatchEvent(new Event("change")); });
      expect(target.style.transform).toBe("");
      pointer(document.documentElement);
      expect(target.style.transform).toBe("");
      await act(async () => { coarse.matches = false; coarse.dispatchEvent(new Event("change")); });
      pointer(document.documentElement);
      expect(target.style.transform).not.toBe("");
      await act(async () => { reduced.matches = true; reduced.dispatchEvent(new Event("change")); });
      expect(target.style.transform).toBe("");
      pointer(document.documentElement);
      expect(target.style.transform).toBe("");
      await act(async () => { reduced.matches = false; reduced.dispatchEvent(new Event("change")); });
      pointer(document.documentElement);
      expect(target.style.transform).not.toBe("");
      await render("page", false, false);
      expect(target.style.transform).toBe("");
      pointer(document.documentElement);
      expect(target.style.transform).toBe("");
      const remove = vi.spyOn(document.documentElement, "removeEventListener");
      await render("page");
      pointer(document.documentElement);
      await act(async () => root.unmount());
      expect(remove.mock.calls.some(([event]) => event === "pointermove")).toBe(true);
      expect(target.style.transform).toBe("");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
});

it("animates opted-in artwork only while visible, foregrounded, and motion is allowed", async () => {
  const appearance = {
    ...appearanceForPalette("deep-tide"),
    customAvatarAssetId: "22222222-2222-4222-8222-222222222222",
    customAvatarMotion: "reactive" as const,
  };
  let intersect: IntersectionObserverCallback | undefined;
  const media = Object.assign(new EventTarget(), { matches: false });
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("matchMedia", () => media);
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (state: "idle" | "working" | "rest" = "idle", motion: "auto" | "still" = "auto") => {
    await act(async () => root.render(<AgentCharacter appearance={appearance} state={state} motion={motion} />));
  };
  const animated = () => container.querySelector(".agent-avatar-motion");
  const setVisible = async (isIntersecting: boolean) => {
    await act(async () => intersect?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
  };
  try {
    await render();
    expect(animated()).toBeNull();
    await setVisible(true);
    expect(animated()?.classList.contains("agent-avatar-motion-idle")).toBe(true);
    expect(container.querySelector("canvas")).toBeNull();
    await render("working");
    expect(animated()?.classList.contains("agent-avatar-motion-working")).toBe(true);
    hidden = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(animated()).toBeNull();
    hidden = false;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(animated()).not.toBeNull();
    await act(async () => { media.matches = true; media.dispatchEvent(new Event("change")); });
    expect(animated()).toBeNull();
    await act(async () => { media.matches = false; media.dispatchEvent(new Event("change")); });
    expect(animated()).not.toBeNull();
    await setVisible(false);
    expect(animated()).toBeNull();
    await setVisible(true);
    await render("rest");
    expect(animated()).toBeNull();
    await render("idle", "still");
    expect(animated()).toBeNull();
    await act(async () => root.render(<AgentCharacter appearance={{ ...appearance, customAvatarMotion: "still" }} />));
    expect(animated()).toBeNull();
  } finally {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
