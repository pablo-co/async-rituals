import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <AppNav />
      <main id="main" className="page page-narrow has-bottom-nav">
        {children}
      </main>
      <div className="toast-region" aria-live="polite" />
    </>
  );
}
