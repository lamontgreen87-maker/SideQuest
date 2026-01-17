import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import { theme } from "../theme";

export default function HomeScreen({
  tabs,
  activeTab,
  onTabChange,
  headerRight,
  headerTitle = "Side Quest",
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
        <Text style={styles.title}>{headerTitle}</Text>
        <View style={styles.headerIcons}>
          <View
            style={[
              styles.statusDot,
              statusOnline ? styles.statusOnline : styles.statusOffline,
            ]}
          />
          {onCartPress ? (
            <Pressable style={styles.iconButton} onPress={onCartPress}>
              <Text style={styles.iconLabel}>🛒</Text>
            </Pressable>
          ) : null}
          {onSettingsPress ? (
            <Pressable style={styles.iconButton} onPress={onSettingsPress}>
              <Text style={styles.iconLabel}>⚙</Text>
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
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusOnline: {
    backgroundColor: theme.colors.emerald,
    shadowColor: theme.colors.emerald,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statusOffline: {
    backgroundColor: theme.colors.crimson,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  credit: {
    paddingHorizontal: 4,
  },
  iconButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  iconLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  title: {
    color: theme.colors.gold,
    fontSize: 22,
    fontFamily: theme.fonts.header,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  action: {
    flex: 1,
    minWidth: 100,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.layout.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  actionPrimary: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.goldDim,
  },
  actionGhost: {
    backgroundColor: "transparent",
  },
  actionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: theme.fonts.button,
  },
  actionPressed: {
    opacity: 0.7,
  },
  tabScroll: {
    maxHeight: 50,
    marginBottom: theme.spacing.sm,
  },
  tabBar: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  tab: {
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.layout.radius.sm, // Less rounded, more rune-stone like
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: 'rgba(197, 160, 89, 0.15)', // Gold with low opacity
    borderColor: theme.colors.goldDim,
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: theme.fonts.body,
  },
  tabTextActive: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.header, // Cinzel for active tab
    fontWeight: 'bold',
  },
  body: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
    padding: theme.spacing.lg,
    // No background here, PageContainer handles it
  },
});
