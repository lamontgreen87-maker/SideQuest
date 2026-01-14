import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
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
  onEmailSignIn,
  onEmailRegister,
  onViewSessions,
}) {
  const isBusy = authStatus?.loading;
  const connectedAddress = walletStatus?.address || walletAddress;
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showEmail, setShowEmail] = React.useState(false);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Side Quest</Text>
          <Text style={styles.subtitle}>
            {showWalletConnect ? "Connect your wallet or sign in." : "Sign in to start your adventure."}
          </Text>
        </View>

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
  statusOk: {
    color: theme.colors.emerald,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  statusError: {
    color: theme.colors.crimson,
    fontSize: 14,
    fontFamily: theme.fonts.body,
  },
  statusWarn: {
    color: theme.colors.warning,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  statusMuted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
});
