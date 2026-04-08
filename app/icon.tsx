import { ImageResponse } from "next/og";

// Browser favicon — generated at build time. Replaces app/favicon.ico.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: "#0d9488",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          borderRadius: 6,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        S
      </div>
    ),
    size,
  );
}
