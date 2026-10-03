import { useTranslations } from "next-intl";
import type { Onboarding } from "@devdigest/shared";

/** The banner text: how the tour was produced, then one line per degradation note. */
export function useBannerLines(tour: Onboarding | null): string[] {
  const t = useTranslations("onboarding");
  if (!tour) return [];
  const head =
    tour.status === "skeleton"
      ? t("banner.skeleton", {
          reason: t(`reasons.${tour.skeleton_reason ?? "provider_error"}`, { provider: tour.provider }),
        })
      : t("banner.ai", {
          calls: tour.llm_calls,
          tokens: tour.tokens_in + tour.tokens_out,
          cost: tour.cost_usd == null ? "—" : `$${tour.cost_usd}`,
        });
  return [head, ...tour.notes.map((n) => t(`notes.${n}`, { count: tour.files_indexed }))];
}
