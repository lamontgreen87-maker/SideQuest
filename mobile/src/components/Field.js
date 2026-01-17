import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../theme";

export default function Field({ label, value, onChangeText, placeholder, ...props }) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: theme.spacing.md,
  },
  label: {
    color: theme.colors.gold,
    fontSize: 12,
    fontFamily: theme.fonts.body,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    color: theme.colors.textPrimary,
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Darker translucent background
    fontFamily: theme.fonts.body,
    fontSize: 16,
  },
});
