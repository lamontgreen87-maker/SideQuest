import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Field from "../components/Field";
import Section from "../components/Section";
import Screen from "../components/Screen";

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
        <View style={styles.header}>
          <Text style={styles.title}>Side Quest</Text>
          <Text style={styles.subtitle}>Enter your name to begin.</Text>
        </View>

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
              label="Save URL"
              onPress={onSaveServerUrl}
              style={{ flex: 1 }}
            />
            {onRefreshServerUrl ? (
              <Button
                label="Refresh"
                onPress={onRefreshServerUrl}
                variant="ghost"
                style={{ flex: 1 }}
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
    padding: 20,
    gap: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: "#333",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    color: "#666",
    fontSize: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  statusError: {
    color: "#d32f2f",
    fontSize: 14,
    marginTop: 5,
  },
  statusMuted: {
    color: "#888",
    fontSize: 12,
  },
});
