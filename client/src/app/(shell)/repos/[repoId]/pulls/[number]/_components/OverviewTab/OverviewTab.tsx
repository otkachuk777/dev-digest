"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  headSha: string;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, headSha, prBody }: OverviewTabProps) {
  return (
    <>
      <IntentCard prId={prId} headSha={headSha} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
