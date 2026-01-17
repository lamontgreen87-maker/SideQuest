import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Field from "../components/Field";
import Section from "../components/Section";
import Screen from "../components/Screen";
import { theme } from "../theme";

export default function AuthScreen({
  serverUrl,
  setServerUrl,
  onSaveServerUrl,
  onRefreshServerUrl,
  authStatus,
  onGuestSignIn,
  accountLabel,
<<<<<<< HEAD
=======
  showWalletConnect = true,
  showGoogleSignIn = false,
  onEmailSignIn,
  onEmailRegister,
  onViewSessions,
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9
}) {
  const [playerName, setPlayerName] = useState("");
  const isBusy = authStatus?.loading;
<<<<<<< HEAD

  const handleSignIn = () => {
    if (!playerName.trim()) return;
    onGuestSignIn?.();
  };
=======
  const connectedAddress = walletStatus?.address || walletAddress;
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showEmail, setShowEmail] = React.useState(false);
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
<<<<<<< HEAD
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
=======
        <View style={styles.header}>
          <Text style={styles.title}>Side Quest</Text>
          <Text style={styles.subtitle}>
            {showWalletConnect ? "Connect your wallet or sign in." : "Sign in to start your adventure."}
          </Text>
        </View>
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9

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
<<<<<<< HEAD
=======

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
          </Section>
        ) : null}

        <Section title="Account">
          <Text style={styles.statusMuted}>
            Account: {accountLabel || "Not signed in"}
          </Text>

          {!accountLabel && (
            <>
              <View style={styles.row}>
                <Button
                  label={isBusy ? "Signing In..." : "Play as Guest"}
                  onPress={onGuestSignIn}
                  disabled={isBusy}
                  variant={showEmail ? "ghost" : "primary"}
                />
                <Button
                  label="Email Login"
                  onPress={() => setShowEmail(!showEmail)}
                  variant={showEmail ? "primary" : "ghost"}
                />
              </View>

              {showEmail && (
                <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="hero@adventure.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Field
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Secret password"
                    secureTextEntry
                  />
                  <View style={styles.row}>
                    <Button
                      label={isBusy ? "Logging in..." : "Log In"}
                      onPress={() => onEmailSignIn(email, password)}
                      disabled={isBusy || !email || !password}
                    />
                    <Button
                      label={isBusy ? "Registering..." : "Register"}
                      onPress={() => onEmailRegister(email, password)}
                      disabled={isBusy || !email || !password}
                      variant="ghost"
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {accountLabel && (
            <View style={{ gap: theme.spacing.md }}>
              <Button
                label="My Campaigns"
                onPress={onViewSessions}
                variant="primary"
              />
              <Button
                label="Sign Out"
                onPress={onDisconnect} // Using disconnect for generic sign out
                variant="danger"
              />
            </View>
          )}

          {authStatus?.error ? (
            <Text style={styles.statusError}>{authStatus.error}</Text>
          ) : null}
        </Section>

        {showGoogleSignIn ? (
          <Section title="Google">
            <View style={styles.row}>
              <Button
                label={isBusy ? "Signing In..." : "Sign In with Google"}
                onPress={onGoogleSignIn}
                disabled={isBusy}
              />
            </View>
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
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: theme.colors.gold,
    fontSize: 36,
    fontFamily: theme.fonts.header,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 3,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
    marginBottom: theme.spacing.sm,
  },
<<<<<<< HEAD
=======
  statusOk: {
    color: theme.colors.emerald,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9
  statusError: {
    color: theme.colors.crimson,
    fontSize: 14,
    fontFamily: theme.fonts.body,
  },
<<<<<<< HEAD
=======
  statusWarn: {
    color: theme.colors.warning,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9
  statusMuted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
});
