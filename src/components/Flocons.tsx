/**
 * Fine falling snow on a canvas over the home hero.
 * pointer-events none, aria-hidden. Still frame if reduced motion.
 */
import { useEffect, useRef } from "react";

export function Flocons({
  count = 240,
  speedMin = 0.22,
  speedMax = 0.95,
  wind = 0.14,
  windVariation = 0.4,
  sizeMin = 0.45,
  sizeMax = 1.8,
  opacityMin = 22,
  opacityMax = 68,
}: {
  count?: number;
  speedMin?: number;
  speedMax?: number;
  wind?: number;
  windVariation?: number;
  sizeMin?: number;
  sizeMax?: number;
  opacityMin?: number;
  opacityMax?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cont = box.current;
    const el = canvas.current;
    if (!cont || !el) return;
    const g = el.getContext("2d");
    if (!g) return;

    let raf = 0;
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    type F = { x: number; y: number; r: number; vy: number; vx: number; phase: number; sway: number; a: number };
    let flakes: F[] = [];

    const build = (entry?: ResizeObserverEntry) => {
      const cr = entry?.contentRect;
      W = Math.max(1, Math.floor(cr?.width || cont.clientWidth) || 1);
      H = Math.max(1, Math.floor(cr?.height || cont.clientHeight) || 1);
      el.width = Math.floor(W * dpr);
      el.height = Math.floor(H * dpr);
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(sizeMin, sizeMax),
        vy: rand(speedMin, speedMax),
        vx: rand(-1, 1),
        phase: Math.random() * Math.PI * 2,
        sway: rand(0.15, 0.7),
        a: rand(opacityMin / 100, opacityMax / 100),
      }));
    };

    const draw = () => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#ffffff";
      for (const f of flakes) {
        g.globalAlpha = f.a;
        g.beginPath();
        g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    };

    const loop = (t: number) => {
      for (const f of flakes) {
        f.y += f.vy;
        f.x += wind + f.vx * windVariation + Math.sin(t * 0.0012 + f.phase) * f.sway;
        if (f.y - f.r > H) {
          f.y = -f.r;
          f.x = Math.random() * W;
        }
        if (f.x < -f.r) f.x = W + f.r;
        else if (f.x > W + f.r) f.x = -f.r;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };

    build();
    draw();
    if (!still) raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver((es) => {
      build(es[0]);
      draw();
    });
    ro.observe(cont);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count, speedMin, speedMax, wind, windVariation, sizeMin, sizeMax, opacityMin, opacityMax]);

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[1]" aria-hidden data-testid="home-snow">
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
