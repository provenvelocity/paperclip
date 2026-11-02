import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { resolveAgentAppearance, type CharacterState } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { characterSlot } from "@/lib/agent-character-slot";
import { AgentAvatar, avatarSizeClasses, type AgentAvatarProps } from "./AgentAvatar";
import type { createCharacter } from "@paperclipai/shared/cliplab/runtime";

type Player = ReturnType<typeof createCharacter>;
export interface AgentCharacterProps extends Omit<AgentAvatarProps, "pose"> {
  state?: CharacterState;
  motion?: "auto" | "still";
  trackingRegion?: RefObject<HTMLElement | null>;
  trackingScope?: "region" | "page";
  followCursor?: boolean;
  followRotation?: boolean;
}
export function AgentCharacter({ agent, appearance, size = 256, state = "idle", muted = false, motion = "auto", trackingRegion, trackingScope = "region", followCursor = true, followRotation = true, className, label, name }: AgentCharacterProps) {
  const identity = useMemo(() => resolveAgentAppearance(appearance ?? agent?.appearance, agent?.id), [appearance, agent?.appearance, agent?.id]);
  const root = useRef<HTMLSpanElement>(null), host = useRef<HTMLSpanElement>(null), player = useRef<Player | null>(null);
  const customTracking = useRef<HTMLSpanElement>(null);
  const slotId = useRef(Symbol("agent-character"));
  const owner = useSyncExternalStore(characterSlot.subscribe, characterSlot.getSnapshot, () => null);
  const [visible, setVisible] = useState(false), [reduced, setReduced] = useState(true), [failed, setFailed] = useState(false), [ready, setReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const customMotion = Boolean(identity.customAvatarAssetId && identity.customAvatarMotion === "reactive");
  const active = (!identity.customAvatarAssetId || customMotion) && visible && pageVisible && !reduced && !failed && motion === "auto" && state !== "rest";
  useEffect(() => {
    if (typeof matchMedia !== "function" || typeof IntersectionObserver !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches); change(); media.addEventListener("change", change);
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); media.removeEventListener("change", change); };
  }, []);
  useEffect(() => {
    const change = () => setPageVisible(!document.hidden);
    change();
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (active && owner === null) characterSlot.acquire(slotId.current);
    if (!active) characterSlot.release(slotId.current);
  }, [active, owner]);
  useEffect(() => () => characterSlot.release(slotId.current), []);
  useEffect(() => {
    const target = customTracking.current;
    if (!target || !customMotion || !active || owner !== slotId.current || (!followCursor && !followRotation)) return;
    const region = trackingScope === "page" ? target.ownerDocument.documentElement : trackingRegion?.current ?? root.current;
    if (!region || !root.current) return;
    const coarse = matchMedia("(pointer: coarse)");
    const center = () => {
      target.style.transform = "";
      target.style.removeProperty("--avatar-eye-x");
      target.style.removeProperty("--avatar-eye-y");
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || coarse.matches) return;
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = (event.clientX - bounds.left - bounds.width / 2) / Math.max(80, bounds.width / 2);
      const dy = (event.clientY - bounds.top - bounds.height / 2) / Math.max(80, bounds.height / 2);
      const distance = Math.max(1, Math.hypot(dx, dy));
      const x = dx / distance, y = dy / distance;
      target.style.setProperty("--avatar-eye-x", `${followCursor ? x * 2 : 0}px`);
      target.style.setProperty("--avatar-eye-y", `${followCursor ? y * 1.5 : 0}px`);
      target.style.transform = `perspective(600px) translate(${followCursor ? x * 4 : 0}%, ${followCursor ? y * 4 : 0}%) rotateX(${followRotation ? -y * 8 : 0}deg) rotateY(${followRotation ? x * 10 : 0}deg)`;
    };
    const sync = () => {
      region.removeEventListener("pointermove", pointer);
      region.removeEventListener("pointerleave", center);
      center();
      if (!coarse.matches) {
        region.addEventListener("pointermove", pointer, { passive: true });
        region.addEventListener("pointerleave", center);
      }
    };
    sync();
    coarse.addEventListener("change", sync);
    return () => {
      region.removeEventListener("pointermove", pointer);
      region.removeEventListener("pointerleave", center);
      coarse.removeEventListener("change", sync);
      center();
    };
  }, [customMotion, active, owner, trackingRegion, trackingScope, followCursor, followRotation]);
  useEffect(() => {
    if (!active || owner !== slotId.current || identity.customAvatarAssetId) return;
    let disposed = false;
    setReady(false);
    void Promise.all([import("@paperclipai/shared/cliplab/runtime"), import("@paperclipai/shared/cliplab/definition")]).then(([runtime, library]) => {
      if (disposed || !host.current) return;
      player.current = runtime.createCharacter(host.current, library.characterDefinition(identity, muted), {
        animation: library.animationId(state), trackingRegion: trackingRegion?.current ?? root.current ?? undefined,
        followCursor, followRotation, trackingScope, displaySize: size, onError: () => setFailed(true),
      });
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; player.current?.destroy(); player.current = null; setReady(false); };
  }, [active, owner, identity.customAvatarAssetId, trackingRegion, trackingScope, size, followCursor, followRotation]);
  useEffect(() => {
    if (!player.current) return;
    void import("@paperclipai/shared/cliplab/definition").then(library => {
      player.current?.setDefinition(library.characterDefinition(identity, muted));
      player.current?.setAnimation(library.animationId(state));
    });
  }, [identity, muted, state, ready]);
  return <span ref={root} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    className={cn("relative inline-block shrink-0", avatarSizeClasses[size], className)}>
    <span ref={customTracking} className={cn("inline-block size-full", customMotion && "agent-avatar-tracking")}>
      <AgentAvatar agent={agent} appearance={identity} size={size < 256 ? 256 : size} name={name} pose={state} muted={muted} eyeLayers
        className={cn("size-full", ready && !identity.customAvatarAssetId && "invisible",
          customMotion && active && owner === slotId.current && `agent-avatar-motion agent-avatar-motion-${state}`)} />
    </span>
    <span ref={host} className="absolute inset-0" />
  </span>;
}
