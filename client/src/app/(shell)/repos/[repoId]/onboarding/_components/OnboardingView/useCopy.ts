import React from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/lib/toast";
import { COPIED_MS } from "./constants";

/** Clipboard write with a failure toast. `key` flashes "Copied" for COPIED_MS (the button that was used). */
export function useCopy() {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string, key?: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(t("copyFailed"));
      return false;
    }
    if (key) {
      setCopied(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), COPIED_MS);
    }
    return true;
  };
  return { copy, copied };
}
