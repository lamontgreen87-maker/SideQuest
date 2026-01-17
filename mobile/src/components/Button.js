import React from "react";
import { FantasyButton } from "./FantasyButton";

export default function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  style,
}) {
  const mapVariant = (v) => {
    switch (v) {
      case "danger": return "crimson";
      case "ghost": return "ghost";
      default: return "gold";
    }
  };

  return (
    <FantasyButton
      title={label}
      onPress={onPress}
      disabled={disabled}
      variant={mapVariant(variant)}
      style={style}
    />
  );
}
