"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [leaguesOpen, setLeaguesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getCurrentUser().then(setUser).catch(() => setUser(null));
  }, [pathname]);

  useEffect(() => {
    setLeaguesOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setSessionExpired(true);
      setTimeout(() => {
        setSessionExpired(false);
        router.replace("/auth/login");
      }, 2500);
    }
    window.addEventListener("fantasy:session-expired", handleSessionExpired);
    return () => window.removeEventListener("fantasy:session-expired", handleSessionExpired);
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLeaguesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function onLogout() {
    await logout();
    setUser(null);
    window.location.href = "/auth/login";
  }

  return (
    <>
      {sessionExpired && (
        <div className="session-banner">Your session has expired. Redirecting to login…</div>
      )}
      <nav className="app-nav">
        <Link href="/" className="nav-brand">Fantasy IPL 2026</Link>

        <div className="nav-links">
          <div className="nav-dropdown" ref={dropdownRef}>
            <button
              className="nav-dropdown-toggle"
              onClick={() => setLeaguesOpen((prev) => !prev)}
              aria-expanded={leaguesOpen}
              aria-haspopup="true"
            >
              Leagues <span className={`nav-chevron${leaguesOpen ? " open" : ""}`}>▾</span>
            </button>
            {leaguesOpen && (
              <div className="nav-dropdown-menu" role="menu">
                <Link href="/leagues" role="menuitem" onClick={() => setLeaguesOpen(false)}>My Leagues</Link>
                <Link href="/leagues/create" role="menuitem" onClick={() => setLeaguesOpen(false)}>Create League</Link>
                <Link href="/leagues/join" role="menuitem" onClick={() => setLeaguesOpen(false)}>Join League</Link>
              </div>
            )}
          </div>
          <Link href="/players">Players</Link>
          <Link href="/schedule">IPL Schedule</Link>
        </div>

        <div className="nav-spacer" />

        <div className="nav-right">
          {user ? (
            <>
              <span className="nav-user">{user.displayName}</span>
              <button className="nav-action" onClick={() => void onLogout()}>Logout</button>
            </>
          ) : (
            <>
              <Link href="/auth/login">Login</Link>
              <Link href="/auth/register">Register</Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
