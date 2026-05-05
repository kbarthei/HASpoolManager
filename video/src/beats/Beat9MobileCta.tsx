import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BrandLogo } from "../components/BrandLogo";
import { colors, fonts, radii } from "../theme";

const MOBILE_SHOTS = [
  "screenshots/dark/mobile/01-dashboard.png",
  "screenshots/dark/mobile/02-inventory.png",
  "screenshots/dark/mobile/05-prints.png",
];

export const Beat9MobileCta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;

  // Carousel phase: frames 0..280
  // CTA phase: frames 280..480

  // Each phone tilts in from below with a stagger
  const phones = MOBILE_SHOTS.map((src, i) => {
    const start = 20 + i * 25;
    const enter = spring({
      frame: frame - start, fps,
      config: { damping: 14, stiffness: 100 },
    });
    return { src, enter, start };
  });

  // Carousel fades out (Beat is 375 frames total; phones run 0..220, then handoff)
  const carouselFadeOut = interpolate(frame, [200, 240], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // CTA fades in
  const ctaOpacity = interpolate(frame, [220, 260], [0, 1], { extrapolateRight: "clamp" });
  const ctaSpring = spring({
    frame: frame - 220, fps,
    config: { damping: 16, stiffness: 90 },
  });

  // Final author-credits screen fades in over the CTA in the last ~70 frames
  const closeFade = interpolate(frame, [305, 345], [0, 1], { extrapolateRight: "clamp" });
  const ctaVisibilityFade = closeFade > 0 ? 1 - closeFade : 1;

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {/* Phone carousel */}
      <div style={{
        position: "absolute",
        inset: 0,
        opacity: carouselFadeOut,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: isVertical ? 0 : 60,
        flexDirection: isVertical ? "column" : "row",
        padding: 60,
      }}>
        {phones.map((p, i) => {
          const phoneWidth = isVertical ? 280 : 380;
          // Mobile screenshots are very tall (780x3100 — full-page PWA capture).
          // Constrain to a phone frame and crop top.
          const phoneHeight = isVertical ? 360 : 720;
          return (
            <div
              key={p.src}
              style={{
                width: phoneWidth,
                height: phoneHeight,
                opacity: p.enter,
                transform: `translateY(${(1 - p.enter) * 80}px) rotate(${(i - 1) * 4}deg)`,
                borderRadius: 36,
                overflow: "hidden",
                border: `4px solid ${colors.surface2}`,
                boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                background: colors.bg,
              }}
            >
              <Img
                src={staticFile(p.src)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top center",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* CTA panel */}
      <AbsoluteFill style={{
        opacity: ctaOpacity,
        justifyContent: "center",
        alignItems: "center",
        gap: 36,
        fontFamily: fonts.sans,
        background: `radial-gradient(circle at 50% 50%, ${colors.surface} 0%, ${colors.bg} 70%)`,
      }}>
        <div style={{
          opacity: ctaVisibilityFade,
          transform: `scale(${0.9 + ctaSpring * 0.1})`,
        }}>
          <BrandLogo size={isVertical ? 90 : 120} tagline="" animate={false} />
        </div>

        <div style={{
          opacity: ctaVisibilityFade,
          fontSize: isVertical ? 40 : 56,
          fontWeight: 700,
          color: colors.text,
          textAlign: "center",
          letterSpacing: -1,
          maxWidth: isVertical ? 900 : 1400,
          padding: "0 60px",
        }}>
          Open-source.<br />
          Self-hosted.<br />
          <span style={{ color: colors.accent }}>Two-click install.</span>
        </div>

        {/* HA repository badge — custom-sized for impact */}
        <div style={{
          opacity: ctaVisibilityFade,
          transform: `translateY(${(1 - ctaSpring) * 16}px)`,
          padding: "16px 28px",
          background: colors.haBlue,
          borderRadius: radii.pill,
          fontSize: isVertical ? 22 : 28,
          fontWeight: 700,
          color: "#FFFFFF",
          boxShadow: `0 12px 30px ${colors.haBlue}66`,
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "#000",
            color: colors.haBlue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 16,
          }}>
            HA
          </div>
          Add repository to my Home Assistant
        </div>

        <div style={{
          opacity: ctaVisibilityFade,
          fontFamily: fonts.mono,
          fontSize: isVertical ? 18 : 22,
          color: colors.textMuted,
          letterSpacing: 0.4,
        }}>
          github.com/kbarthei/HASpoolManager
        </div>
      </AbsoluteFill>

      {/* Final brand-only close — author credits */}
      <AbsoluteFill style={{
        opacity: closeFade,
        justifyContent: "center",
        alignItems: "center",
        gap: 18,
        background: colors.bg,
      }}>
        <BrandLogo size={isVertical ? 90 : 120} tagline="" animate={false} />
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: colors.textMuted,
          fontFamily: fonts.sans,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}>
          Built by
        </div>
        <div style={{
          fontSize: isVertical ? 40 : 52,
          color: colors.text,
          fontFamily: fonts.sans,
          fontWeight: 700,
          letterSpacing: -0.5,
        }}>
          Kai Bartheidel
        </div>
        <div style={{
          fontSize: isVertical ? 22 : 26,
          color: colors.accent,
          fontFamily: fonts.mono,
          fontWeight: 500,
          letterSpacing: 0.4,
        }}>
          kai@bartheidel.de
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
