import React from "react";
import { colors, radii } from "../theme";

type CardProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
};

export const Card: React.FC<CardProps> = ({ children, style, className }) => {
  return (
    <div
      className={className}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.card,
        padding: 24,
        color: colors.text,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
