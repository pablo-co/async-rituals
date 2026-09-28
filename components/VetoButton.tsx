"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * "Vetar" on a Cola row and its confirmation sheet (D-2C, DESIGN.md "Modal / sheet", destructive): the title names
 * the game, the body says what happens, "Sí, vetar" in red on top on phones, focus starts on "Cancelar", Tab stays
 * inside, Esc and a click outside cancel, and closing returns focus to this row's "Vetar".
 */
export function VetoButton({
  gameId,
  title,
  body,
  action,
}: {
  gameId: string;
  title: string;
  body: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !sheet.current) return;
    const focusable = [...sheet.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button ref={trigger} type="button" className="btn-tertiary min-h-11" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Vetar
      </button>
      {open ? (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div
            ref={sheet}
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            onKeyDown={onKeyDown}
          >
            <span className="sheet-handle" aria-hidden="true" />
            <h2 id={titleId} className="font-display text-(length:--text-lg)">
              {title}
            </h2>
            <p id={bodyId} className="text-muted text-(length:--text-sm)">
              {body}
            </p>
            <form action={action} className="modal-actions md:flex-row-reverse md:justify-start">
              <input type="hidden" name="game_id" value={gameId} />
              <SubmitButton className="btn-danger" pendingLabel="Vetando…">
                Sí, vetar
              </SubmitButton>
              <button ref={cancel} type="button" className="btn-secondary min-h-12" onClick={close}>
                Cancelar
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
