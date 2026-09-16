"use client";

import { Activity, CalendarDays, Plug } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/cola", label: "Cola", Icon: CalendarDays },
  { href: "/actividad", label: "Actividad", Icon: Activity },
  { href: "/conectar", label: "Conectar", Icon: Plug },
] as const;

/** Bottom navigation on phones; tabs under the header on desktop (one breakpoint, 768px). */
export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="max-md:hidden">
        <nav className="tabs page-narrow mx-auto" aria-label="Secciones">
          {ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="tab"
              aria-current={isActive(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="bottom-nav" aria-label="Secciones">
        {ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="nav-item"
            aria-current={isActive(href) ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
