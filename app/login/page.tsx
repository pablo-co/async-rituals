import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <>
      <AppHeader />
      <main id="main" className="page page-narrow">
        <LoginForm />
      </main>
    </>
  );
}
