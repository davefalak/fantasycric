"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authFetch } from "@/lib/auth";
import { readApi } from "@/lib/api";

interface LeagueSummary {
  id: string;
  name: string;
}

export default function JoinLeaguePage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await authFetch("/api/leagues/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode })
      });
      const result = await readApi<LeagueSummary>(response);
      if (!result.success || !result.data) {
        setError(result.error || "Could not join league");
        return;
      }
      router.push(`/leagues/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <section className="panel auth-card">
        <h1>Join League</h1>
        <p className="meta">Enter an invite code from a league admin to join an existing competition.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="label">
            Invite code
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Joining…" : "Join League"}</button>
        </form>
      </section>
    </main>
  );
}
