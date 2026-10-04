"use client";

import { useState } from "react";

export default function UnlockPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't unlock.");
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only same-site paths, never an absolute URL handed in from outside.
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("You appear to be offline.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <form onSubmit={submit} className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        <h1 className="text-xl font-semibold text-white">Enter your passcode</h1>
        <p className="mt-1 text-sm text-white/50">This phone stays unlocked afterwards.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="mt-5 w-full rounded-xl border border-[var(--color-line)] bg-transparent px-4 py-3 text-lg text-white outline-none focus:border-[var(--color-work)]"
        />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          disabled={busy || !passcode}
          className="mt-5 w-full rounded-2xl bg-[var(--color-work)] py-3.5 font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
