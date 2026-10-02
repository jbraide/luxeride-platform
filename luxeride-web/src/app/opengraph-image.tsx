import { ImageResponse } from "next/og";

// The site-wide Open Graph fallback card, 1200x630.
//
// Uses only the default bundled font — reading a font over the network at build
// time makes the build fail on a flaky connection, for decoration.
//
// The colours are the tokens from src/app/globals.css, inlined because a
// generated image cannot read a CSS custom property.

export const alt = "LuxeRide — custom-fit car accessories, laser-measured for your exact car";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          borderTop: "12px solid #d4af37",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 6,
            color: "#d4af37",
            textTransform: "uppercase",
          }}
        >
          Laser-measured · Fitted to your exact car
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 104,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.05,
          }}
        >
          LuxeRide
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 38,
            color: "rgba(255,255,255,0.62)",
          }}
        >
          Floor mats, seat covers, cargo liners & more
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 30,
            color: "#d4af37",
          }}
        >
          Pay on delivery · Nationwide
        </div>
      </div>
    ),
    size,
  );
}
