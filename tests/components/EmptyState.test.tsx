import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders title, help and the action", () => {
    render(<EmptyState title="Sin juegos en cola" help="Genera una semana." action={<button>Generar</button>} />);
    expect(screen.getByRole("heading", { name: "Sin juegos en cola" })).toBeInTheDocument();
    expect(screen.getByText("Genera una semana.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar" })).toBeInTheDocument();
  });
});
