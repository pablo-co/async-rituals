"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NETWORK_ERROR = "No pude conectar. Revisa tu internet e inténtalo de nuevo.";
const EXISTS_ERROR = "Ese correo ya tiene cuenta. Entra con tu contraseña.";
const PASSWORD_ERROR = "La contraseña necesita al menos 8 caracteres.";
const EMAIL_ERROR = "Escribe un correo válido.";

export function LoginForm() {
  const router = useRouter();
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId() };
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setEmailError(null);
    setPasswordError(null);
    setTopError(null);
    setNotice(null);
  }

  function validate(): boolean {
    let ok = true;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(EMAIL_ERROR);
      ok = false;
    } else {
      setEmailError(null);
    }
    if (password.length < 8) {
      setPasswordError(PASSWORD_ERROR);
      ok = false;
    } else {
      setPasswordError(null);
    }
    return ok;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTopError(null);
    setNotice(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          if (error.code === "invalid_credentials" || error.status === 400) {
            setPasswordError("Correo o contraseña incorrectos.");
          } else {
            setTopError(NETWORK_ERROR);
          }
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          if (error.code === "user_already_exists" || error.code === "email_exists") {
            setEmailError(EXISTS_ERROR);
          } else if (error.code === "weak_password") {
            setPasswordError(PASSWORD_ERROR);
          } else if (error.code === "validation_failed") {
            setEmailError(EMAIL_ERROR);
          } else {
            setTopError(NETWORK_ERROR);
          }
          return;
        }
        // With "Confirm email" on, Supabase answers an existing email with an empty identities list.
        if (data.user && data.user.identities?.length === 0) {
          setEmailError(EXISTS_ERROR);
          return;
        }
        if (data.user && !data.session) {
          setNotice(
            "Revisa tu correo para confirmar la cuenta. Si no llega, avísale a quien te dio acceso.",
          );
          return;
        }
      }
      router.push("/");
      router.refresh();
    } catch {
      setTopError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === "signin" ? "Entrar" : "Crear cuenta";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-(length:--text-xl)">
          {mode === "signin" ? "Entra a Rituales" : "Crea tu cuenta"}
        </h1>
        <p className="text-muted text-(length:--text-sm)">
          Aquí administras el bot de tu equipo. Tus compañeros solo juegan en Slack.
        </p>
      </div>

      <div className="segmented self-start" role="tablist" aria-label="Entrar o crear cuenta">
        <button
          type="button"
          role="tab"
          className="segment"
          aria-selected={mode === "signin"}
          onClick={() => switchMode("signin")}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          className="segment"
          aria-selected={mode === "signup"}
          onClick={() => switchMode("signup")}
        >
          Crear cuenta
        </button>
      </div>

      {topError ? <Alert tone="error">{topError}</Alert> : null}
      {notice ? <Alert tone="warning">{notice}</Alert> : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <fieldset disabled={loading} className="flex flex-col gap-4 border-0 p-0 m-0 min-w-0">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.email} className="label-default">
              Correo
            </label>
            <input
              id={ids.email}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`input-default w-full ${emailError ? "input-error" : ""}`}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? ids.emailError : undefined}
            />
            {emailError ? (
              <p id={ids.emailError} className="error-text">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={ids.password} className="label-default">
              Contraseña
            </label>
            <div className="flex gap-2">
              <input
                id={ids.password}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`input-default w-full min-w-0 ${passwordError ? "input-error" : ""}`}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? ids.passwordError : undefined}
              />
              <button
                type="button"
                className="icon-btn shrink-0"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            </div>
            {passwordError ? (
              <p id={ids.passwordError} className="error-text">
                {passwordError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn-primary w-full min-h-12 inline-flex items-center justify-center gap-2"
            data-loading={loading || undefined}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? (mode === "signin" ? "Entrando…" : "Creando cuenta…") : submitLabel}
          </button>
        </fieldset>
      </form>

      <p className="help-text">¿Olvidaste tu contraseña? Escríbele a quien te dio acceso.</p>
    </div>
  );
}
