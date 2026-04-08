import { ImageResponse } from "next/og";

// iOS home-screen icon (Add to Home Screen). 180×180 is what iOS picks up
// from <link rel="apple-touch-icon">. Next.js auto-emits the link tag when
// this file exists at app/apple-icon.tsx.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: -8,
            marginTop: -10,
            lineHeight: 1,
          }}
        >
          S
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 1,
            opacity: 0.9,
            marginTop: 4,
          }}
        >
          POOL
        </div>
      </div>
    ),
    size,
  );
}
