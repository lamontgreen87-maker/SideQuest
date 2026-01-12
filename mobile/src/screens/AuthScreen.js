import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
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
  walletStatus,
  walletAddress,
  walletConnected,
  onOpenWallet,
  authStatus,
  onSignIn,
  onGoogleSignIn,
  onGuestSignIn,
  onDisconnect,
  updateStatus,
  onResetWallet,
  accountLabel,
  showWalletConnect = true,
  showGoogleSignIn = false,
}) {
  const isBusy = authStatus?.loading;
  const connectedAddress = walletStatus?.address || walletAddress;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Side Quest</Text>
        <Text style={styles.subtitle}>Connect your wallet to continue.</Text>


        {showWalletConnect ? (
          <Section title="Wallet">
            <View style={styles.row}>
              <Button
                label={walletConnected ? "Wallet Connected" : "Connect Wallet"}
                onPress={onOpenWallet}
                disabled={false}
              />
              <Button label="Disconnect" onPress={onDisconnect} variant="ghost" />
              {onResetWallet ? (
                <Button label="Reset Wallet" onPress={onResetWallet} variant="ghost" />
              ) : null}
            </View>
            <Text style={styles.statusMuted}>
              {connectedAddress ? `Wallet: ${connectedAddress}` : "No wallet connected"}
            </Text>
            <Text style={styles.statusMuted}>
              Account: {accountLabel || "Guest"}
            </Text>
            <View style={styles.row}>
              <Button
                label={isBusy ? "Signing In..." : "Sign In"}
                onPress={onSignIn}
                disabled={!connectedAddress || isBusy}
              />
              <Button
                label={isBusy ? "Signing In..." : "Sign In as Guest"}
                onPress={onGuestSignIn}
                variant="ghost"
                disabled={isBusy}
              />
            </View>
            {authStatus?.error ? (
              <Text style={styles.statusError}>{authStatus.error}</Text>
            ) : null}
          </Section>
        ) : null}

        {showGoogleSignIn ? (
          <Section title="Google">
            <View style={styles.row}>
              <Button
                label={isBusy ? "Signing In..." : "Sign In with Google"}
                onPress={onGoogleSignIn}
                disabled={isBusy}
              />
              <Button
                label={isBusy ? "Signing In..." : "Sign In as Guest"}
                onPress={onGuestSignIn}
                variant="ghost"
                disabled={isBusy}
              />
            </View>
            <Text style={styles.statusMuted}>
              Account: {accountLabel || "Guest"}
            </Text>
            {authStatus?.error ? (
              <Text style={styles.statusError}>{authStatus.error}</Text>
            ) : null}
          </Section>
        ) : null}

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
  statusOk: {
    color: colors.success,
    fontSize: 12,
  },
  statusError: {
    color: colors.accent,
    fontSize: 12,
  },
  statusWarn: {
    color: colors.warning,
    fontSize: 12,
  },
  statusMuted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
