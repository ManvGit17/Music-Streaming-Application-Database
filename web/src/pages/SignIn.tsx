import * as Tabs from "@radix-ui/react-tabs";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Headphones, ShieldCheck, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { api } from "@/data/api";
import { cn } from "@/lib/util";

const PERSONAS = [
  { login: "john_doe", name: "John Doe", note: "Rock and pop, plays daily", icon: Headphones },
  {
    login: "jane_smith",
    name: "Jane Smith",
    note: "Different taste, different recommendations",
    icon: UserRound,
  },
  {
    login: "admin",
    name: "Admin",
    note: "The vamusic_admin role: audit log and rollups",
    icon: ShieldCheck,
  },
];

const input =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft";

export default function SignInPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (fn: () => Promise<unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      client.clear();
      toast.success("Signed in");
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onLogin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void finish(() => api.login(String(form.get("login")), String(form.get("password"))), "form");
  };

  const onRegister = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void finish(
      () =>
        api.register(
          String(form.get("username")),
          String(form.get("email")),
          String(form.get("password")),
        ),
      "register",
    );
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 pt-10 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <p className="eyebrow">One click, no password to remember</p>
        <h1 className="text-4xl md:text-5xl">Choose who to be</h1>
        <p className="text-muted">
          Each sample account sees different rows: row-level security in PostgreSQL decides, not the
          app. Their password is <code className="font-mono text-ink">vamusic</code>.
        </p>
        <ul className="flex flex-col gap-2">
          {PERSONAS.map(({ login, name, note, icon: Icon }) => (
            <li key={login}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void finish(() => api.login(login, "vamusic"), login)}
                className="glass group flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-hover disabled:opacity-60"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{name}</span>
                  <span className="block text-sm text-muted">{note}</span>
                </span>
                <ArrowRight
                  className={cn(
                    "size-5 text-faint transition-transform group-hover:translate-x-1",
                    busy === login && "animate-pulse",
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-[2rem] p-6 md:p-8">
        <Tabs.Root defaultValue="login" className="flex flex-col gap-6">
          <Tabs.List aria-label="Account" className="flex gap-1 rounded-full bg-sunk p-1">
            {[
              ["login", "Sign in"],
              ["register", "Create account"],
            ].map(([v, label]) => (
              <Tabs.Trigger
                key={v}
                value={v!}
                className="h-10 flex-1 rounded-full text-sm font-medium text-muted data-[state=active]:bg-ink data-[state=active]:text-bg"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {error ? (
            <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </p>
          ) : null}
          <Tabs.Content value="login" className="outline-none">
            <form onSubmit={onLogin} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Username or email
                <input name="login" required autoComplete="username" className={input} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={input}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                busy={busy === "form"}
                className="mt-2"
              >
                Sign in
              </Button>
            </form>
          </Tabs.Content>
          <Tabs.Content value="register" className="outline-none">
            <form onSubmit={onRegister} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Username
                <input
                  name="username"
                  required
                  pattern="[A-Za-z0-9_.]{3,32}"
                  title="3 to 32 letters, digits, dots or underscores"
                  autoComplete="username"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Email
                <input name="email" type="email" required autoComplete="email" className={input} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={input}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                busy={busy === "register"}
                className="mt-2"
              >
                Create account
              </Button>
              <p className="text-xs text-faint">
                {api.mode === "browser"
                  ? "Stored only in this browser's copy of the database. The password is hashed with bcrypt by pgcrypto."
                  : "Your password is hashed with bcrypt before it reaches the database."}
              </p>
            </form>
          </Tabs.Content>
        </Tabs.Root>
      </section>
    </div>
  );
}
