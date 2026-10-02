/* Onboarding Tour — /repos/:repoId/onboarding. Generate and read a five-section tour. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { useRepoNotFound } from "@/lib/repo-context";
import { RepoNotFound } from "../_components/RepoNotFound";
import { OnboardingView } from "./_components/OnboardingView";

export default function OnboardingPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  if (repoNotFound) return <RepoNotFound />;
  return (
    <React.Suspense fallback={<Skeleton height={200} />}>
      <OnboardingView repoId={repoId} />
    </React.Suspense>
  );
}
