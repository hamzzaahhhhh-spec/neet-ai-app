"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, decodeRole } from "@/lib/api";

const istDate = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
};

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("StudentPass123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem("neet_token") || "" : ""));

  const role = useMemo(() => (token ? decodeRole(token) : null), [token]);
  const today = istDate();

  const submit = async () => {
    try {
      setLoading(true);
      setError("");
      const payload = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      localStorage.setItem("neet_token", payload.token);
      setToken(payload.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("neet_token");
    setToken("");
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 md:py-16">
      <section className="mb-8 grid gap-4 rounded-3xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-orange-50 p-6 shadow-xl md:grid-cols-[1.3fr_1fr] md:p-10">
        <div>
          <p className="mb-3 inline-block rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">NEET 2026 Daily Engine</p>
          <h1 className="mb-4 font-[var(--font-title)] text-4xl font-bold leading-tight md:text-5xl">
            Practice Like Exam Day, Every Day
          </h1>
          <p className="max-w-2xl text-sm text-baseText/80 md:text-base">
            100-question balanced papers, strict topic controls, exam mode timer, analytics, and adaptive recommendations.
            New paper generation runs daily on server schedule.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-panel px-3 py-1 font-medium">100 Questions</span>
            <span className="rounded-full bg-panel px-3 py-1 font-medium">Physics / Chemistry / Biology</span>
            <span className="rounded-full bg-panel px-3 py-1 font-medium">Admin + Analytics</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm">
          <p className="mb-3 font-semibold">Today (IST)</p>
          <p className="mb-4 text-xl font-bold">{today}</p>
          <p className="text-xs text-baseText/70">If today&apos;s paper is unavailable, use Admin Panel to regenerate.</p>
        </div>
      </section>

      {!token ? (
        <section className="mx-auto max-w-xl rounded-2xl border bg-panel p-6 shadow-soft">
          <div className="mb-5 flex gap-2 text-sm">
            <button className={`rounded-lg px-4 py-2 font-medium ${mode === "login" ? "bg-sky-600 text-white" : "bg-panelAlt"}`} onClick={() => setMode("login")}>Login</button>
            <button className={`rounded-lg px-4 py-2 font-medium ${mode === "register" ? "bg-sky-600 text-white" : "bg-panelAlt"}`} onClick={() => setMode("register")}>Register</button>
          </div>
          <div className="grid gap-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border p-3" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="rounded-lg border p-3" />
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button disabled={loading} onClick={submit} className="rounded-lg bg-sky-600 px-4 py-3 text-white disabled:opacity-60">
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border bg-panel p-6 shadow-soft">
          <p className="text-sm">Authenticated as <strong>{role || "student"}</strong>.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/quiz/${today}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start Today&apos;s Quiz</Link>
            {role === "admin" ? <Link href="/admin" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Open Admin Panel</Link> : null}
            <button onClick={logout} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Logout</button>
          </div>
        </section>
      )}
    </main>
  );
}
