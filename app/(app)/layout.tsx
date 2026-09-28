import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/Toaster";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <AppNav />
      <main id="main" className="page page-narrow has-bottom-nav">
        {children}
      </main>
      <Suspense fallback={<div className="toast-region" aria-live="polite" />}>
        <Toaster />
      </Suspense>
    </>
  );
}
