import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { FantasyCard } from "./FantasyCard";

export default function Section({ title, children, style }) {
  return (
    <View style={[styles.wrapper, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <FantasyCard variant="standard" style={styles.card}>
        {children}
      </FantasyCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    color: theme.colors.gold,
    fontSize: 18,
    fontFamily: theme.fonts.header,
    marginBottom: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  card: {
    padding: theme.spacing.md,
  }
});
