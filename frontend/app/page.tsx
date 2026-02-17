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
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <h1 className="mb-3 font-[var(--font-title)] text-4xl font-bold">NEET 2026 AI Daily Prediction Website</h1>
      <p className="mb-8 text-sm text-baseText/80">100 auto-generated NEET-pattern MCQs daily at 00:01 IST with strict topic controls.</p>

      {!token ? (
        <section className="rounded-2xl border bg-panel p-6 shadow-soft">
          <div className="mb-4 flex gap-2 text-sm">
            <button className={`rounded px-3 py-1 ${mode === "login" ? "bg-sky-600 text-white" : "bg-panelAlt"}`} onClick={() => setMode("login")}>Login</button>
            <button className={`rounded px-3 py-1 ${mode === "register" ? "bg-sky-600 text-white" : "bg-panelAlt"}`} onClick={() => setMode("register")}>Register</button>
          </div>
          <div className="grid gap-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded border p-2" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="rounded border p-2" />
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button disabled={loading} onClick={submit} className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-60">
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border bg-panel p-6 shadow-soft">
          <p className="text-sm">Authenticated as <strong>{role || "student"}</strong>.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/quiz/${today}`} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start Today&apos;s Quiz</Link>
            {role === "admin" ? <Link href="/admin" className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Open Admin Panel</Link> : null}
            <button onClick={logout} className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Logout</button>
          </div>
        </section>
      )}
    </main>
  );
}