import { useEffect, useRef } from "react";

// The hero dot field as a canvas of BEAMS: each dot is a round-capped
// stroke through its grid point, aimed at the pointer. At rest every beam
// has zero length, so you see a dot. As the pointer sweeps the plane the
// beams tip toward it like iron filings: needles near the cursor grow and
// converge on it, the far field stays dots. Nothing is displaced; the
// beams only rotate and lengthen, with eased length and direction so the
// field feels damped.
//
// Cost discipline: the loop idles out of view (IntersectionObserver) and
// when the tab hides; touch devices and prefers-reduced-motion get one
// static frame and never start it. The CSS dot layer stays as the
// no-JS/first-paint fallback and is dropped only once the canvas paints.

const PITCH = 26; // css px between beams
const BASE_R = 1.1; // css px: half the stroke width, so a resting beam reads as the same dot as before
const REACH = 170; // pointer influence radius
const MAX_HALF = 11; // css px: half-length of a fully tipped beam
const EASE = 0.45; // beam length spring
const TURN = 0.5; // direction easing
const RAMP = 0.3; // influence fade-in

export function DotField() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const interactive = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let dark = document.documentElement.classList.contains("dark");

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    // Per-beam state: eased half-length and eased aim direction.
    let hl = new Float32Array(0);
    let ux = new Float32Array(0);
    let uy = new Float32Array(0);
    let px = -1e4; // smoothed pointer
    let py = -1e4;
    let tx = -1e4; // pointer target
    let ty = -1e4;
    let strength = 0;
    let targetStrength = 0;
    let inView = true;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = dark ? "#ededf0" : "#161619";
      ctx.lineWidth = BASE_R * 2;
      ctx.lineCap = "round";
      const baseAlpha = dark ? 0.3 : 0.55;
      const reach2 = REACH * REACH;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const y = r * PITCH + PITCH / 2;
        for (let c = 0; c < cols; c++, i++) {
          const x = c * PITCH + PITCH / 2;
          const half = hl[i] ?? 0;
          const dirX = ux[i] ?? 1;
          const dirY = uy[i] ?? 0;
          const dx = x - px;
          const dy = y - py;
          const d2 = dx * dx + dy * dy;
          let alpha = baseAlpha;
          if (d2 < reach2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / REACH;
            alpha = Math.min(1, baseAlpha + f * f * (3 - 2 * f) * 0.45 * strength);
          }
          ctx.globalAlpha = alpha;
          if (half < 0.2) {
            // Collapsed beam: a dot, identical to the resting field.
            ctx.beginPath();
            ctx.arc(x, y, BASE_R, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(x - dirX * half, y - dirY * half);
            ctx.lineTo(x + dirX * half, y + dirY * half);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / PITCH) + 1;
      rows = Math.ceil(height / PITCH) + 1;
      const n = cols * rows;
      hl = new Float32Array(n);
      ux = new Float32Array(n);
      uy = new Float32Array(n);
      for (let i = 0; i < n; i++) ux[i] = 1;
      // The canvas is painted: retire the CSS dot underlay so the two
      // layers never stack into a moire.
      canvas.style.backgroundImage = "none";
      draw();
    };

    const step = () => {
      raf = requestAnimationFrame(step);
      if (!inView || document.hidden) return;
      // The convergence point is the cursor, not a smoothed ghost of it:
      // pointer smoothing here was the entire "laggy" feel. The damping
      // belongs in the beams, which still swing and grow over a few frames.
      px = tx;
      py = ty;
      strength += (targetStrength - strength) * RAMP;
      const reach2 = REACH * REACH;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const y = r * PITCH + PITCH / 2;
        for (let c = 0; c < cols; c++, i++) {
          const x = c * PITCH + PITCH / 2;
          let targetHalf = 0;
          let targetUX = ux[i] ?? 1;
          let targetUY = uy[i] ?? 0;
          const dx = px - x;
          const dy = py - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / REACH;
            targetHalf = MAX_HALF * f * f * (3 - 2 * f) * strength;
            targetUX = dx / d;
            targetUY = dy / d;
          }
          const nextHalf = (hl[i] ?? 0) + (targetHalf - (hl[i] ?? 0)) * EASE;
          // Ease the aim vector, then renormalize so beams never stretch.
          let nextUX = (ux[i] ?? 1) + (targetUX - (ux[i] ?? 1)) * TURN;
          let nextUY = (uy[i] ?? 0) + (targetUY - (uy[i] ?? 0)) * TURN;
          const len = Math.hypot(nextUX, nextUY) || 1;
          nextUX /= len;
          nextUY /= len;
          hl[i] = nextHalf;
          ux[i] = nextUX;
          uy[i] = nextUY;
        }
      }
      draw();
    };

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      tx = event.clientX - rect.left;
      ty = event.clientY - rect.top;
      targetStrength = 1;
    };
    const onLeave = () => {
      targetStrength = 0;
    };

    const themeObserver = new MutationObserver(() => {
      dark = document.documentElement.classList.contains("dark");
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const viewObserver = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? inView;
    });
    viewObserver.observe(canvas);

    resize();

    if (interactive && !reduced.matches) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // The CSS dot layer doubles as the pre-hydration and no-JS fallback.
  return <canvas ref={ref} className="bg-dots absolute inset-0 h-full w-full" aria-hidden="true" />;
}
