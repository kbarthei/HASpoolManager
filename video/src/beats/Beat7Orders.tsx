import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { parsedOrderRows } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

const MOCK_EMAIL = `Subject: Order #28341 confirmed
From: shop@bambulab.com

Thank you for your order.

— 2 × Bambu PLA Matte Ivory      @ €21.99
— 3 × PolyTerra Charcoal Black   @ €16.50
— 4 × eSun PETG-HF Black         @ €19.00
— 1 × Bambu Support-for-PLA      @ €27.99

Subtotal: €198.46
Shipping: €4.99
TOTAL:    €203.45`;

export const Beat7Orders: React.FC = () => {
  const frame = useCurrentFrame();

  // Email types in over frames 20..120
  const emailCharsPerFrame = MOCK_EMAIL.length / 100;
  const emailChars = Math.max(0, Math.floor((frame - 20) * emailCharsPerFrame));
  const emailText = MOCK_EMAIL.slice(0, emailChars);

  // Claude shimmer 130..200
  const shimmerOpacity = interpolate(frame, [125, 145], [0, 1], { extrapolateRight: "clamp" })
    * interpolate(frame, [195, 215], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shimmerSweep = interpolate(frame, [125, 215], [-30, 130]);

  // Line items appear one by one starting at frame 220, 30 frames apart
  const itemRevealAt = (i: number) => 220 + i * 30;

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/07-orders.png"
        fit="top-aligned"
        scale={0.92}
      />

      {/* Floating email-paste card — left side */}
      <div style={{
        position: "absolute",
        left: "5%",
        top: "20%",
        width: "38%",
        height: "60%",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        padding: "20px 24px",
        fontFamily: fonts.mono,
        fontSize: 14,
        color: colors.text,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
      }}>
        <div style={{
          fontSize: 11, fontFamily: fonts.sans, fontWeight: 600,
          color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1,
          marginBottom: 12,
        }}>
          Paste email
        </div>
        <div style={{ lineHeight: 1.6 }}>
          {emailText}
          {emailChars < MOCK_EMAIL.length && (
            <span style={{ color: colors.accent }}>▍</span>
          )}
        </div>

        {/* Shimmer overlay during Claude parse */}
        {shimmerOpacity > 0 && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(110deg,
              transparent 0%,
              transparent ${shimmerSweep - 20}%,
              ${colors.accent}33 ${shimmerSweep}%,
              transparent ${shimmerSweep + 20}%,
              transparent 100%)`,
            opacity: shimmerOpacity,
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* Arrow + "Claude" label */}
      <div style={{
        position: "absolute",
        left: "44%", top: "44%",
        opacity: interpolate(frame, [140, 170], [0, 1], { extrapolateRight: "clamp" }),
        fontFamily: fonts.sans,
        color: colors.accent,
        fontSize: 18, fontWeight: 600,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>→</div>
        <div>Claude parses</div>
      </div>

      {/* Parsed rows — right side */}
      <div style={{
        position: "absolute",
        left: "52%",
        top: "20%",
        width: "42%",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        padding: "20px 24px",
        fontFamily: fonts.sans,
        color: colors.text,
        opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 16,
        }}>
          Parsed line items
        </div>

        {parsedOrderRows.map((row, i) => {
          const opacity = interpolate(frame, [itemRevealAt(i), itemRevealAt(i) + 18], [0, 1], {
            extrapolateRight: "clamp",
          });
          const slideX = interpolate(frame, [itemRevealAt(i), itemRevealAt(i) + 18], [12, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < parsedOrderRows.length - 1 ? `1px solid ${colors.border}` : "none",
                opacity,
                transform: `translateX(${slideX}px)`,
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: row.color,
                border: `1px solid ${colors.border}`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{row.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.mono }}>
                  {row.shop} · ×{row.quantity}
                </div>
              </div>
              <div style={{
                fontFamily: fonts.mono, fontWeight: 700, fontSize: 18,
                color: colors.accent,
              }}>
                €{(row.unitPriceEur * row.quantity).toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
