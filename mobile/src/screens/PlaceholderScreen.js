import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export default function PlaceholderScreen({ title, detail }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 12,
  },
  title: {
    color: colors.parchment,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  detail: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
