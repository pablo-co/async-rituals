import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Lora, Nunito_Sans } from "next/font/google";
import "./globals.css";

const display = Lora({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const body = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Rituales", template: "%s · Rituales" },
  description:
    "Juegos cortos para que tu equipo se conozca, dentro de Slack y en piloto automático.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint so the dark class is set without a flash.
// Reads localStorage only if the user toggled the theme before; otherwise follows the system.
const themeScript = `(function(){try{var s=localStorage.getItem("theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

// Inline custom properties win over the ones declared by the theme CSS,
// so next/font is always the font that renders.
const fontVars = {
  "--font-display": display.style.fontFamily,
  "--font-body": body.style.fontFamily,
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      data-theme="calida"
      className={`${display.variable} ${body.variable}`}
      style={fontVars}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="app-shell">{children}</body>
    </html>
  );
}
