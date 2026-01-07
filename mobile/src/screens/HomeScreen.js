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
  statusOnline = true,
  statusLabel = "Server ready",
  onSettingsPress,
  onCartPress,
  bodyStyle,
  actions = [],
}) {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Side Quest</Text>
        <View style={styles.headerIcons}>
          <View
            style={[
              styles.statusDot,
              statusOnline ? styles.statusOnline : styles.statusOffline,
            ]}
          />
          {onCartPress ? (
            <Pressable style={styles.iconButton} onPress={onCartPress}>
              <Text style={styles.iconLabel}>Cart</Text>
            </Pressable>
          ) : null}
          {onSettingsPress ? (
            <Pressable style={styles.iconButton} onPress={onSettingsPress}>
              <Text style={styles.iconLabel}>Settings</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{statusLabel}</Text>
        {headerRight ? <View style={styles.credit}>{headerRight}</View> : null}
      </View>
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              onPress={action.onPress}
              disabled={action.disabled}
              style={({ pressed }) => [
                styles.action,
                action.variant === "primary" && styles.actionPrimary,
                action.variant === "ghost" && styles.actionGhost,
                pressed && styles.actionPressed,
                action.style,
              ]}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
        style={styles.tabScroll}
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
                allowFontScaling={false}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.body, bodyStyle]}>{children}</View>
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  statusOnline: {
    backgroundColor: colors.success,
  },
  statusOffline: {
    backgroundColor: colors.accent,
  },
  statusText: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  credit: {
    paddingHorizontal: 4,
  },
  iconButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  iconLabel: {
    fontSize: 16,
  },
  title: {
    color: colors.parchment,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  action: {
    flex: 1,
    minWidth: 100,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  actionGhost: {
    backgroundColor: "transparent",
  },
  actionLabel: {
    color: colors.parchment,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  actionPressed: {
    opacity: 0.65,
  },
  tabScroll: {
    maxHeight: 56,
    marginBottom: spacing.sm,
  },
  tabBar: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    maxWidth: 140,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: {
    color: colors.mutedGold,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabTextActive: {
    color: colors.ink,
  },
  body: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
    padding: spacing.lg,
  },
});
