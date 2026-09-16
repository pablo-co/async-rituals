import { ImageResponse } from "next/og";
import { THEME_ACCENT, THEME_ON_ACCENT } from "@/lib/theme";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Lora 600 for the "R". Google Fonts returns a TrueType file when no browser
// User-Agent is sent; Satori (next/og) cannot read woff2.
async function loadLora(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Lora:wght@600&text=R",
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Icon() {
  const lora = await loadLora();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: THEME_ACCENT,
          color: THEME_ON_ACCENT,
          borderRadius: 7,
          fontFamily: lora ? "Lora" : "serif",
          fontSize: 22,
          fontWeight: 600,
        }}
      >
        R
      </div>
    ),
    {
      ...size,
      fonts: lora
        ? [{ name: "Lora", data: lora, weight: 600, style: "normal" }]
        : [],
    },
  );
}
