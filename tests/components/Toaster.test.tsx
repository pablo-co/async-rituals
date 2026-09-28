import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let search = "toast=vetoed&generating=1";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/cola",
  useRouter: () => ({ replace }),
}));

afterEach(() => {
  vi.useRealTimers();
  replace.mockClear();
});

describe("Toaster", () => {
  it("shows the toast a server action asked for, cleans the address, and goes away after 4 s", async () => {
    vi.useFakeTimers();
    const { Toaster } = await import("@/components/Toaster");
    render(<Toaster />);
    expect(screen.getByRole("status")).toHaveTextContent("Vetado. Se rellena en la próxima generación.");
    expect(replace).toHaveBeenCalledWith("/cola?generating=1", { scroll: false });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps at most three toasts and leaves the address alone without one", async () => {
    search = "generating=1";
    const { Toaster, showToast } = await import("@/components/Toaster");
    render(<Toaster />);
    act(() => ["uno", "dos", "tres", "cuatro"].forEach((t) => showToast(t)));
    expect(screen.getAllByRole("status").map((el) => el.textContent)).toEqual(["dos", "tres", "cuatro"]);
    expect(replace).not.toHaveBeenCalled();
  });
});
