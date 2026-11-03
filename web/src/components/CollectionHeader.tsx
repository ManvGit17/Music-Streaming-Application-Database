import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/util";
import { Cover } from "./Cover";

interface Props {
  seed: number;
  hue: number;
  eyebrow: string;
  title: ReactNode;
  meta: ReactNode;
  actions?: ReactNode;
  round?: boolean;
}

/** The big header shared by album, artist and playlist pages. */
export function CollectionHeader({ seed, hue, eyebrow, title, meta, actions, round }: Props) {
  return (
    <header className="relative -mx-1 overflow-hidden rounded-[2rem] md:-mx-4">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, oklch(0.55 0.12 ${hue} / 0.55), transparent 85%)`,
        }}
      />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={cn("w-44 shrink-0 md:w-56", round && "md:w-52")}
        >
          <Cover
            seed={seed}
            hue={hue}
            rounded={round ? "full" : "xl"}
            className="shadow-[0_30px_60px_-24px_oklch(0_0_0/0.55)]"
          />
        </motion.div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="text-4xl leading-[1.05] break-words md:text-6xl lg:text-7xl">{title}</h1>
          <div className="text-sm text-muted">{meta}</div>
        </div>
      </div>
      {actions ? (
        <div className="relative flex flex-wrap items-center gap-3 px-6 pb-6 md:px-8">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
