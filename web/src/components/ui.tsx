import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertTriangle, Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/util";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-float hover:brightness-110 active:brightness-95 disabled:opacity-50",
  secondary: "glass text-ink hover:bg-hover disabled:opacity-50",
  ghost: "text-muted hover:text-ink hover:bg-hover disabled:opacity-40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium transition-[filter,background-color,color,transform] duration-200 active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
}

/** An icon-only button; `label` is both its accessible name and its tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = "md", className, children, ...rest },
  ref,
) {
  const dim = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200",
            active ? "text-accent" : "text-muted hover:text-ink",
            "hover:bg-hover disabled:opacity-40",
            dim,
            className,
          )}
          {...rest}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-float data-[state=delayed-open]:animate-in"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      {icon ? <div className="text-faint">{icon}</div> : null}
      <h3 className="text-xl">{title}</h3>
      {children ? <p className="max-w-md text-sm text-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="glass flex flex-col items-start gap-3 rounded-2xl p-6">
      <div className="flex items-center gap-2 text-bad">
        <AlertTriangle className="size-5" aria-hidden />
        <span className="font-medium">Something went wrong</span>
      </div>
      <p className="font-mono text-sm text-muted">{message}</p>
      {retry ? (
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Section({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h2 className="text-2xl md:text-[1.75rem]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn";
}) {
  const tones = {
    neutral: "border-line text-muted",
    accent: "border-transparent bg-accent-soft text-accent",
    good: "border-transparent bg-good/15 text-good",
    warn: "border-transparent bg-warn/15 text-warn",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
