import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "@/components/Alert";

describe("Alert", () => {
  it("errors are announced as alerts", () => {
    render(<Alert tone="error">No pude guardar.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("No pude guardar.");
  });
  it("other tones are status messages with the tone class", () => {
    render(<Alert tone="warning">Sin llave.</Alert>);
    expect(screen.getByRole("status")).toHaveClass("alert-warning");
  });
});
