import React from "react";
import { colors, fonts, radii } from "../theme";

type HomeAssistantBadgeProps = {
  label?: string;
};

export const HomeAssistantBadge: React.FC<HomeAssistantBadgeProps> = ({
  label = "Add repository to my Home Assistant",
}) => {
  return (
    <div
      style={{
        background: colors.haBlue,
        color: colors.bg,
        fontFamily: fonts.sans,
        fontWeight: 700,
        fontSize: 18,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "14px 22px",
        borderRadius: radii.pill,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        boxShadow: `0 8px 32px ${colors.haBlue}55`,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: colors.bg,
          color: colors.haBlue,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 14,
        }}
      >
        HA
      </div>
      {label}
    </div>
  );
};
