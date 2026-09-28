import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VetoButton } from "@/components/VetoButton";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: false }),
}));

const setup = () =>
  render(<VetoButton gameId="g1" title="¿Vetar «Trivia de capitales»?" body="Se quita de la cola." action={vi.fn(async () => {})} />);

describe("VetoButton", () => {
  it("opens a destructive sheet with the focus on Cancelar and the game id in the form", () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Vetar" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Vetar «Trivia de capitales»?" });
    expect(dialog).toHaveAccessibleDescription("Se quita de la cola.");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Sí, vetar" })).toHaveClass("btn-danger");
    expect(container.querySelector('input[name="game_id"]')).toHaveValue("g1");
  });

  it("closes on Escape and gives the focus back to Vetar", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Vetar" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside, never on a click inside", () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Vetar" }));
    fireEvent.mouseDown(screen.getByRole("alertdialog"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.mouseDown(container.querySelector(".overlay")!);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps Tab inside the sheet", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Vetar" }));
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Sí, vetar" });
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Tab" });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
  });
});
