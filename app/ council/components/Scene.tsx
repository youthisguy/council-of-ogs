"use client";

import { useEffect, useRef, useState } from "react";
import { Persona } from "@/app/src/personas/personas";

type SceneProps = {
  persona: Persona;
  dimmed: boolean;
};

// How far each layer is allowed to drift from center, in pixels.
// Background drifts further than the character -> reads as "further away."
const BACKGROUND_DRIFT = 60;
const CHARACTER_DRIFT = 18;

export default function Scene({ persona, dimmed }: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // -1..1 normalized

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Normalize cursor position within the container to -1..1
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      setOffset({ x: nx, y: ny });
    }

    // Listen on window, not just the container, so the effect still feels
    // alive even when the cursor briefly leaves the bounds (e.g. near edges).
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  // Reduced-motion users get a static scene — no parallax math applied.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const bgX = prefersReducedMotion ? 0 : offset.x * BACKGROUND_DRIFT;
  const bgY = prefersReducedMotion ? 0 : offset.y * (BACKGROUND_DRIFT * 0.6);
  const charX = prefersReducedMotion ? 0 : offset.x * CHARACTER_DRIFT;
  const charY = prefersReducedMotion ? 0 : offset.y * (CHARACTER_DRIFT * 0.5);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden transition-[filter,transform] duration-500 ${
        dimmed ? "scale-105 blur-[3px] brightness-[0.45]" : ""
      }`}
    >
      {/* Background layer — oversized so it has room to drift without
          exposing an edge. translate moves opposite to cursor for a
          "looking into the room" feel. */}
      <div
        className="absolute will-change-transform"
        style={{
          inset: `-${BACKGROUND_DRIFT + 20}px`,
          backgroundImage: `url(${persona.backgroundSrc ?? ""})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          transform: `translate3d(${-bgX}px, ${-bgY}px, 0)`,
          transition: "transform 120ms ease-out",
        }}
      />
      {/* Fallback gradient so the scene isn't blank before art is wired in */}
      {!persona.backgroundSrc && (
        <div
          className="absolute will-change-transform"
          style={{
            inset: `-${BACKGROUND_DRIFT + 20}px`,
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(201,168,118,0.10), transparent 60%), linear-gradient(180deg, #1a1410 0%, #0d0a07 100%)",
            transform: `translate3d(${-bgX}px, ${-bgY}px, 0)`,
            transition: "transform 120ms ease-out",
          }}
        />
      )}

      {/* Vignette to mask the drifting background's edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(13,10,7,0.85)_100%)]" />

      {/* Character layer — moves less than background, reads as "closer" */}
      <div
        className="absolute inset-0 flex items-end justify-center will-change-transform sm:justify-start sm:pl-[8%]"
        style={{
          transform: `translate3d(${-charX}px, ${-charY}px, 0)`,
          transition: "transform 120ms ease-out",
        }}
      >
        {persona.portraitSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={persona.portraitSrc}
            alt={persona.name}
            className="h-[90%] max-w-[640px] object-contain object-bottom drop-shadow-2xl"
            draggable={false}
          />
        ) : (
          <div className="h-[88%] w-[60%] max-w-[520px] rounded-t-[200px] bg-gradient-to-t from-[#2d2419] via-[#3a3024]/60 to-transparent opacity-80" />
        )}
      </div>

      <div className="absolute bottom-10 left-10 z-10 font-display text-2xl tracking-wide text-[#c9a876] drop-shadow-lg">
        {persona.name}
        <div className="mt-1 font-body text-sm font-normal text-[#e8dcc4]/60">
          {persona.years} · {persona.blurb}
        </div>
      </div>
    </div>
  );
}