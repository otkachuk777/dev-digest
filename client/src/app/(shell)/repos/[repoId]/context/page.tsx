/* Project Context — /repos/:repoId/context. Browse the repo's spec/doc markdown files. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { useRepoNotFound } from "@/lib/repo-context";
import { RepoNotFound } from "../_components/RepoNotFound";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  if (repoNotFound) return <RepoNotFound />;
  return (
    <React.Suspense fallback={<Skeleton height={200} />}>
      <ProjectContextView repoId={repoId} />
    </React.Suspense>
  );
}
