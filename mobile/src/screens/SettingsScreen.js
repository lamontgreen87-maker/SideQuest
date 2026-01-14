import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Field from "../components/Field";
import Section from "../components/Section";
import { theme } from "../theme";

export default function SettingsScreen({
  serverUrl,
  setServerUrl,
  onSaveServerUrl,
  onRefreshServerUrl,
  onSelectServerUrl,
  presets,
  updateStatus,
  onSignOut,
  accountLabel,
  userId,
  credits,
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Account">
        <Text style={styles.statusMuted}>
          Account: {accountLabel || "Signed out"}
        </Text>
        {userId ? (
          <Text style={styles.statusMuted} selectable>
            ID: {userId}
          </Text>
        ) : null}
        <Text style={styles.statusMuted}>Credits: {credits}</Text>
        <Button label="Sign Out" onPress={onSignOut} variant="danger" />
      </Section>

      <Section title="Server">
        <Field
          label="Server URL"
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://your-server.com"
        />
        <View style={styles.row}>
          <Button label="Save" onPress={onSaveServerUrl} disabled={!serverUrl} />
          <Button label="Check Gist" onPress={onRefreshServerUrl} variant="ghost" />
        </View>
        <View style={styles.row}>
          <Button
            label="Use Production"
            onPress={() => onSelectServerUrl(presets?.prod)}
            disabled={!presets?.prod}
            variant="ghost"
          />
        </View>
      </Section>

      <Section title="Updates">
        {updateStatus?.available ? (
          <Text style={styles.statusWarn}>
            New version {updateStatus.latestVersion} available.
          </Text>
        ) : (
          <Text style={styles.statusMuted}>
            {updateStatus?.message || "Up to date."}
          </Text>
        )}
        {updateStatus?.url ? (
          <Button
            label="Open Release"
            onPress={() => Linking.openURL(updateStatus.url)}
            variant="ghost"
          />
        ) : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  statusMuted: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.fonts.body,
  },
  statusWarn: {
    color: theme.colors.gold,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.fonts.body,
  },
});
