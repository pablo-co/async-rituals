import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  return (
    <header className="app-header">
      <span className="font-display text-(length:--text-lg)">Rituales</span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
