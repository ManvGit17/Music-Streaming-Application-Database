import { useEffect, useRef } from "react";
import { usePlayer } from "@/audio/player";

/** A live spectrum from the audio engine's analyser, drawn in the accent colour. */
export function Visualizer({ bars = 28, className }: { bars?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { engine, playing } = usePlayer();

  useEffect(() => {
    const el = canvas.current;
    if (!el || !engine) return;
    const g = el.getContext("2d");
    if (!g) return;
    const data = new Uint8Array(engine.analyser.frequencyBinCount);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth * dpr;
      const h = el.clientHeight * dpr;
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      engine.analyser.getByteFrequencyData(data);
      g.clearRect(0, 0, w, h);
      g.fillStyle = getComputedStyle(el).color;
      const gap = 2 * dpr;
      const bw = (w - gap * (bars - 1)) / bars;
      // Bars are spaced logarithmically from 60 Hz to 8 kHz (where music lives) and each
      // averages its own band, so the whole spectrum moves rather than just the bass end.
      const binHz = engine.ctx.sampleRate / 2 / data.length;
      const edge = (k: number) => Math.max(1, Math.round((60 * (8000 / 60) ** (k / bars)) / binHz));
      for (let i = 0; i < bars; i++) {
        const lo = edge(i);
        const hi = Math.max(lo + 1, edge(i + 1));
        let sum = 0;
        for (let b = lo; b < hi; b++) sum += data[b] ?? 0;
        const v = sum / (hi - lo) / 255;
        const bh = Math.max(2 * dpr, v * h);
        g.globalAlpha = 0.35 + v * 0.65;
        g.beginPath();
        g.roundRect(i * (bw + gap), h - bh, bw, bh, bw / 2);
        g.fill();
      }
      // Animate only while music plays; when paused, one still frame is enough.
      if (playing && !reduced) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [engine, bars, playing]);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
