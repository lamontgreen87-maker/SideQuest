import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
            <Pressable
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
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
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    maxWidth: 120,
  },
  tabActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: {
    color: colors.mutedGold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabTextActive: {
    color: colors.ink,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
});
