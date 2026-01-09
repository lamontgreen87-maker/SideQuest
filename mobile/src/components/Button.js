import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "../theme";

export default function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  style,
}) {
  const containerStyle = [
    styles.base,
    variant === "primary" && styles.primary,
    variant === "ghost" && styles.ghost,
    variant === "danger" && styles.danger,
    disabled && styles.disabled,
    style,
  ];
  const labelStyle = [
    styles.label,
    variant === "ghost" && styles.labelGhost,
    variant === "danger" && styles.labelDanger,
  ];

  return (
    <Pressable onPress={onPress} disabled={disabled} style={containerStyle}>
      <Text
        style={labelStyle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.gold,
  },
  ghost: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.mutedGold,
  },
  danger: {
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
    textAlign: "center",
    flexShrink: 1,
  },
  labelGhost: {
    color: colors.parchment,
  },
  labelDanger: {
    color: colors.ink,
  },
});
