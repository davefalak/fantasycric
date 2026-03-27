"use client";

import { useRouter } from "next/navigation";
import { CreateLeagueForm } from "@/components/CreateLeagueForm";

export default function CreateLeaguePage() {
  const router = useRouter();

  return (
    <main className="container stack-lg">
      <section className="panel">
        <h1>Create League</h1>
        <p className="meta">Configure your league settings and generate an invite code for other players.</p>
      </section>
      <CreateLeagueForm onLeagueCreated={(leagueId) => router.push(`/leagues/${leagueId}`)} />
    </main>
  );
}
