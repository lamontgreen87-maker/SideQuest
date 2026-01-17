import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Field from "../components/Field";
import Section from "../components/Section";
import Screen from "../components/Screen";
import { colors, spacing } from "../theme";

export default function AuthScreen({
  serverUrl,
  setServerUrl,
  onSaveServerUrl,
  onRefreshServerUrl,
  authStatus,
  onGuestSignIn,
  accountLabel,
}) {
  const [playerName, setPlayerName] = useState("");
  const isBusy = authStatus?.loading;

  const handleSignIn = () => {
    if (!playerName.trim()) return;
    onGuestSignIn?.();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Side Quest</Text>
        <Text style={styles.subtitle}>Enter your name to begin your adventure.</Text>

        <Section title="Player Name">
          <Field
            label="Name"
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Enter your name"
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Button
            label={isBusy ? "Loading..." : "Continue"}
            onPress={handleSignIn}
            disabled={!playerName.trim() || isBusy}
          />
          {authStatus?.error ? (
            <Text style={styles.statusError}>{authStatus.error}</Text>
          ) : null}
          {accountLabel ? (
            <Text style={styles.statusMuted}>
              Signed in as: {accountLabel}
            </Text>
          ) : null}
        </Section>

        <Section title="Server Configuration">
          <Field
            label="Server URL"
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://your-runpod-url.com"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <Button
              label="Save Server URL"
              onPress={onSaveServerUrl}
              variant="primary"
            />
            {onRefreshServerUrl ? (
              <Button
                label="Refresh"
                onPress={onRefreshServerUrl}
                variant="ghost"
              />
            ) : null}
          </View>
          <Text style={styles.statusMuted}>
            Current: {serverUrl || "Not configured"}
          </Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    color: colors.parchment,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.mutedGold,
    marginTop: -8,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  statusError: {
    color: colors.accent,
    fontSize: 12,
  },
  statusMuted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
