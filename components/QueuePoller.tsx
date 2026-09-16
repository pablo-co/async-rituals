"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While the first week generates in the background, refresh the server-rendered queue every few
 * seconds (D-2B "Generando…"). Stops on its own: when `active` turns false or after `maxTicks`.
 */
export function QueuePoller({ active, intervalMs = 4000, maxTicks = 20 }: { active: boolean; intervalMs?: number; maxTicks?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      if (window.location.search.includes("generating=1")) router.replace("/cola");
      return;
    }
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      if (ticks > maxTicks) {
        window.clearInterval(id);
        router.replace("/cola");
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, maxTicks, router]);

  return null;
}
