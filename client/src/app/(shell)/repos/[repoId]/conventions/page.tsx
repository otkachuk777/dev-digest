/* Conventions — /repos/:repoId/conventions. Scan → review candidates → create a skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { useRepoNotFound } from "@/lib/repo-context";
import { RepoNotFound } from "../_components/RepoNotFound";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  if (repoNotFound) return <RepoNotFound />;
  return (
    <React.Suspense fallback={<Skeleton height={200} />}>
      <ConventionsView repoId={repoId} />
    </React.Suspense>
  );
}
