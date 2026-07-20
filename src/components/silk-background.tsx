"use client";

import { useEffect, useRef } from "react";

type Ribbon = {
  y: number; // vertical center, fraction of canvas height
  amp: number; // wave amplitude, fraction of canvas height
  freq: number; // full waves across the width
  speed: number; // phase advance per second
  thickness: number; // ribbon thickness, fraction of canvas height
  alpha: number;
};

const RIBBONS: Ribbon[] = [
  { y: 0.3, amp: 0.1, freq: 1.2, speed: 0.12, thickness: 0.22, alpha: 0.09 },
  { y: 0.48, amp: 0.14, freq: 0.9, speed: 0.18, thickness: 0.3, alpha: 0.06 },
  { y: 0.6, amp: 0.09, freq: 1.6, speed: 0.09, thickness: 0.15, alpha: 0.11 },
  { y: 0.74, amp: 0.07, freq: 2.1, speed: 0.15, thickness: 0.1, alpha: 0.07 },
];

// PS4/XMB-style flowing silk ribbons drawn behind the login card. Two
// out-of-phase sine terms per edge keep the drift organic instead of a
// repeating wave; offsetting the bottom edge's phase makes the ribbon's
// thickness undulate like fabric.
export function SilkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function wave(r: Ribbon, x: number, phase: number) {
      const nx = (x / width) * Math.PI * 2 * r.freq;
      return (
        Math.sin(nx + phase) * r.amp * height * 0.6 +
        Math.sin(nx * 0.53 - phase * 0.7 + 2) * r.amp * height * 0.4
      );
    }

    function draw(timeMs: number) {
      const t = timeMs / 1000;
      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "lighter";

      for (const r of RIBBONS) {
        const phase = t * r.speed * Math.PI * 2;
        const half = (r.thickness * height) / 2;
        const step = Math.max(8, width / 120);

        ctx!.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const y = r.y * height - half + wave(r, x, phase);
          if (x === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        for (let x = width + step; x >= 0; x -= step) {
          // phase-shifted bottom edge -> undulating thickness
          ctx!.lineTo(x, r.y * height + half + wave(r, x, phase + 1.3));
        }
        ctx!.closePath();
        ctx!.fillStyle = `rgba(160, 200, 255, ${r.alpha})`;
        ctx!.fill();

        // bright top-edge highlight, the "sheen" of the silk
        ctx!.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const y = r.y * height - half + wave(r, x, phase);
          if (x === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.strokeStyle = `rgba(210, 230, 255, ${Math.min(0.35, r.alpha * 2.5)})`;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
      }
    }

    function loop(timeMs: number) {
      draw(timeMs);
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      draw(0); // single static frame, no animation
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
