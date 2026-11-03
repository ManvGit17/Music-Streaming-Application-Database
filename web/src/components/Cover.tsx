import { useId, useMemo } from "react";
import { cn, mulberry32 } from "@/lib/util";

interface CoverProps {
  seed: number;
  hue: number;
  className?: string;
  rounded?: "md" | "lg" | "xl" | "full";
  label?: string;
}

const MOTIFS = ["rings", "sun", "bands", "grid", "arcs", "none"] as const;
const GRID = Array.from(
  { length: 36 },
  (_, i) => [22 + (i % 6) * 11, 22 + Math.floor(i / 6) * 11] as const,
);

/**
 * Deterministic album art: a blurred mesh of colour, a geometric motif and a little grain,
 * all derived from the seed. The same album always gets the same cover.
 */
export function Cover({ seed, hue, className, rounded = "lg", label }: CoverProps) {
  const id = useId().replace(/:/g, "");
  const art = useMemo(() => {
    const r = mulberry32(seed || 1);
    const h1 = hue;
    const h2 = (hue + 25 + r() * 90) % 360;
    const h3 = (hue + 180 + r() * 60) % 360;
    const light = 0.42 + r() * 0.2;
    const blobs = Array.from({ length: 4 }, () => ({
      cx: r() * 100,
      cy: r() * 100,
      rad: 25 + r() * 35,
      h: [h1, h2, h3][Math.floor(r() * 3)] ?? h1,
      l: light + r() * 0.25,
    }));
    const motif = MOTIFS[Math.floor(r() * MOTIFS.length)] ?? "none";
    return { h1, h2, light, blobs, motif, angle: Math.floor(r() * 360), shift: r() };
  }, [seed, hue]);

  const radius = { md: "rounded-md", lg: "rounded-xl", xl: "rounded-2xl", full: "rounded-full" }[
    rounded
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("block aspect-square w-full shrink-0 overflow-hidden", radius, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`g${id}`} gradientTransform={`rotate(${art.angle} .5 .5)`}>
          <stop offset="0" stopColor={`oklch(${art.light} 0.12 ${art.h1})`} />
          <stop offset="1" stopColor={`oklch(${art.light - 0.12} 0.1 ${art.h2})`} />
        </linearGradient>
        <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id={`n${id}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.4"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#g${id})`} />
      <g filter={`url(#b${id})`} opacity="0.9">
        {art.blobs.map((b, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the blobs are fixed per seed
          <circle key={i} cx={b.cx} cy={b.cy} r={b.rad} fill={`oklch(${b.l} 0.15 ${b.h})`} />
        ))}
      </g>
      <Motif kind={art.motif} shift={art.shift} />
      <rect width="100" height="100" filter={`url(#n${id})`} />
    </svg>
  );
}

function Motif({ kind, shift }: { kind: (typeof MOTIFS)[number]; shift: number }) {
  const stroke = "oklch(1 0 0 / 0.55)";
  switch (kind) {
    case "rings":
      return (
        <g fill="none" stroke={stroke} strokeWidth="0.6">
          {[10, 18, 26, 34, 42].map((r) => (
            <circle key={r} cx={30 + shift * 40} cy={60} r={r} />
          ))}
        </g>
      );
    case "sun":
      return <circle cx={50} cy={40 + shift * 20} r={18} fill="oklch(0.97 0.03 90 / 0.8)" />;
    case "bands":
      return (
        <g fill="oklch(1 0 0 / 0.14)">
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={-20}
              y={20 + i * 18 + shift * 8}
              width="140"
              height="6"
              transform="rotate(-18 50 50)"
            />
          ))}
        </g>
      );
    case "grid":
      return (
        <g fill="oklch(1 0 0 / 0.5)">
          {GRID.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} />
          ))}
        </g>
      );
    case "arcs":
      return (
        <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round">
          <path d={`M 10 ${80 - shift * 20} Q 50 ${20 + shift * 10} 90 ${80 - shift * 20}`} />
          <path d={`M 20 ${90 - shift * 20} Q 50 ${40 + shift * 10} 80 ${90 - shift * 20}`} />
        </g>
      );
    default:
      return null;
  }
}
