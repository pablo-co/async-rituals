import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword, signUp } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { LoginForm } from "@/app/login/LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUp.mockReset();
    push.mockReset();
  });

  it("validates email and password before calling Supabase", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Correo"), "no-es-correo");
    await user.type(screen.getByLabelText("Contraseña"), "corta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("Escribe un correo válido.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña necesita al menos 8 caracteres.")).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the literal error on wrong credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400 } });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Correo"), "pablo@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-larga");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("warns when sign-up returns a user without session", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("tab", { name: "Crear cuenta" }));
    await user.type(screen.getByLabelText("Correo"), "nuevo@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-larga");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Revisa tu correo para confirmar la cuenta.");
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects home after a successful sign-in", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Correo"), "pablo@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-larga");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
