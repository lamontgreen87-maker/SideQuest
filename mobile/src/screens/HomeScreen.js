import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import { colors, radius, spacing } from "../theme";

export default function HomeScreen({
  tabs,
  activeTab,
  onTabChange,
  headerRight,
  children,
}) {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Side Quest</Text>
        {headerRight ? <View>{headerRight}</View> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Text
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.id)}
            >
              {tab.label}
            </Text>
          );
        })}
      </ScrollView>
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: colors.parchment,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  tabBar: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tab: {
    color: colors.mutedGold,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tabActive: {
    backgroundColor: colors.gold,
    color: colors.ink,
    borderColor: colors.gold,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
});
