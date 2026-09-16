"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button with the theme spinner while the server action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`${className} min-h-12 w-full md:w-auto inline-flex items-center justify-center gap-2`}
      disabled={disabled || pending}
      aria-disabled={disabled || pending ? true : undefined}
      data-loading={pending || undefined}
    >
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
