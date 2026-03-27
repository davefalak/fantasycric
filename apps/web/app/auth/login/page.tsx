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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const result = await readApi<AuthResponse>(response);
      if (!result.success || !result.data) {
        setError(result.error || "Login failed");
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
        <h1>Login</h1>
        <p className="meta">Use your account to access leagues and team builder tools.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="label">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="label">
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Login"}</button>
        </form>
        <p className="meta">Need an account? <Link className="text-link" href="/auth/register">Register</Link></p>
      </section>
    </main>
  );
}
