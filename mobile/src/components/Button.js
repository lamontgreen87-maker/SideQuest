import React from "react";
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator } from "react-native";

export default function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  style,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        variant === "ghost" ? styles.ghost : styles.primary,
        disabled && styles.disabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.text,
        variant === "ghost" ? styles.textGhost : styles.textPrimary
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 5,
  },
  primary: {
    backgroundColor: "#2196F3", // Standard Blue
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#444",
  },
  disabled: {
    opacity: 0.5,
    backgroundColor: "#ccc",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  textPrimary: {
    color: "#fff",
  },
  textGhost: {
    color: "#444",
  }
});
