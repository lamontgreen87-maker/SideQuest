import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export default function Section({ title, children }) {
  return (
    <View style={styles.wrapper}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.parchment,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
});
