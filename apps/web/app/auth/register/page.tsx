"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAuthToken } from "@/lib/auth";
import { readApi } from "@/lib/api";

interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password })
      });
      const result = await readApi<AuthResponse>(response);
      if (!result.success || !result.data) {
        setError(result.error || "Registration failed");
        return;
      }
      setAuthToken(result.data.token);
      router.replace("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <section className="panel auth-card">
        <h1>Register</h1>
        <p className="meta">Create an account to join leagues and submit fantasy squads.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="label">
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label className="label">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="label">
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Creating account…" : "Register"}</button>
        </form>
        <p className="meta">Already have an account? <Link className="text-link" href="/auth/login">Login</Link></p>
      </section>
    </main>
  );
}
