import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { WalletConnectModal, useWalletConnectModal } from "@walletconnect/modal-react-native";
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CharacterScreen from "./src/screens/CharacterScreen";
import BestiaryScreen from "./src/screens/BestiaryScreen";
import SpellsScreen from "./src/screens/SpellsScreen";
import StoryScreen from "./src/screens/StoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { apiGet, apiPost } from "./src/api/client";
import {
  APP_VERSION,
  DEFAULT_SERVER_URL,
  GIST_CONFIG_URL,
  GITHUB_RELEASES_URL,
  GITHUB_RELEASES_PAGE,
  LOCAL_SERVER_URL,
  PROD_SERVER_URL,
  STORAGE_KEYS,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
} from "./src/config";
import { getItem, getJson, removeItem, setItem } from "./src/storage";
import { colors, radius, spacing } from "./src/theme";

if (typeof BackHandler.removeEventListener !== "function") {
  BackHandler.removeEventListener = () => {};
}

function normalizeVersion(value) {
  if (!value) return "0.0.0";
  return String(value).replace(/^v/i, "").trim();
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split(".").map((part) => Number(part) || 0);
  const right = normalizeVersion(b).split(".").map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const STORY_BODY_STYLE = {
  padding: 0,
  paddingTop: 0,
  paddingBottom: spacing.lg,
  paddingHorizontal: 0,
  flex: 1,
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Cinzel_400Regular,
    Cinzel_700Bold,
  });
  const { open, provider, isConnected, address } = useWalletConnectModal();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [token, setToken] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [credits, setCredits] = useState(0);
  const [activeTab, setActiveTab] = useState("story");
  const [creationVisible, setCreationVisible] = useState(false);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState({ loading: false, error: null });
  const [walletStatus, setWalletStatus] = useState({});
  const [updateStatus, setUpdateStatus] = useState({
    available: false,
    latestVersion: null,
    url: null,
    message: null,
  });

  const tabs = useMemo(
    () => [
      { id: "story", label: "Story" },
      { id: "spells", label: "Spells" },
      { id: "bestiary", label: "Bestiary" },
      { id: "settings", label: "Settings" },
    ],
    []
  );

  const checkHealth = useCallback(
    async (url) => {
      try {
        const payload = await apiGet(url, "/health");
        setWalletStatus((prev) => ({
          ...prev,
          health: payload?.status ? `${payload.status}` : "ok",
          healthError: null,
        }));
      } catch (error) {
        setWalletStatus((prev) => ({
          ...prev,
          health: null,
          healthError: "Server not reachable.",
        }));
      }
    },
    [setWalletStatus]
  );

  const loadStoredState = useCallback(async () => {
    let initialServerUrl = await getItem(STORAGE_KEYS.serverUrl, DEFAULT_SERVER_URL);
    setServerUrl(initialServerUrl);

    let serverIsHealthy = true;
    try {
      await apiGet(initialServerUrl, "/health");
    } catch (error) {
      serverIsHealthy = false;
    }

    if (!serverIsHealthy) {
      // If server is not healthy, try refreshing from Gist
      try {
        const response = await fetch(GIST_CONFIG_URL);
        if (response.ok) {
          const data = await response.json();
          const candidate =
            data.serverUrl || data.server_url || data.server || data.url || null;
          if (candidate) {
            initialServerUrl = candidate; // Update to new URL from Gist
            setServerUrl(candidate); // Update state
            await setItem(STORAGE_KEYS.serverUrl, candidate); // Save to storage
          }
        }
      } catch (error) {
        // Ignore gist errors and fall back below.
      }
    }

    if (!serverIsHealthy && initialServerUrl !== PROD_SERVER_URL) {
      const fallbackUrl = PROD_SERVER_URL;
      initialServerUrl = fallbackUrl;
      setServerUrl(fallbackUrl);
      await setItem(STORAGE_KEYS.serverUrl, fallbackUrl);
    }

    // Now, run the health check for the *final* determined serverUrl
    checkHealth(initialServerUrl);

    const storedToken = await getItem(STORAGE_KEYS.authToken, null);
    const storedWallet = await getItem(STORAGE_KEYS.authWallet, null);
    if (storedToken) {
      setToken(storedToken);
      setWallet(storedWallet);
      try {
        const me = await apiGet(initialServerUrl, "/api/me");
        setCredits(me.credits || 0);
      } catch (error) {
        await removeItem(STORAGE_KEYS.authToken);
        await removeItem(STORAGE_KEYS.authWallet);
        setToken(null);
        setWallet(null);
      }
    }
  }, [checkHealth]);

  const checkForUpdates = useCallback(async () => {
    try {
      const response = await fetch(GITHUB_RELEASES_URL);
      if (!response.ok) {
        throw new Error("Update check failed.");
      }
      const data = await response.json();
      const latest = data.tag_name || data.name || null;
      const isNewer = latest ? compareVersions(latest, APP_VERSION) > 0 : false;
      setUpdateStatus({
        available: isNewer,
        latestVersion: normalizeVersion(latest),
        url: data.html_url || GITHUB_RELEASES_PAGE,
        message: isNewer ? null : "Up to date.",
      });
    } catch (error) {
      setUpdateStatus({
        available: false,
        latestVersion: null,
        url: null,
        message: "Update check unavailable.",
      });
    }
  }, []);

  useEffect(() => {
    loadStoredState();
    checkForUpdates();
  }, [checkForUpdates, loadStoredState]);

  useEffect(() => {
    NavigationBar.setBehaviorAsync("overlay-swipe");
    NavigationBar.setVisibilityAsync("hidden");
  }, []);

  const saveServerUrl = useCallback(async () => {
    await setItem(STORAGE_KEYS.serverUrl, serverUrl);
    checkHealth(serverUrl);
  }, [serverUrl, checkHealth]);

  const applyServerUrl = useCallback(
    async (nextUrl) => {
      setServerUrl(nextUrl);
      await setItem(STORAGE_KEYS.serverUrl, nextUrl);
      checkHealth(nextUrl);
    },
    [checkHealth]
  );

  const refreshServerUrl = useCallback(async () => {
    try {
      const response = await fetch(GIST_CONFIG_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch gist.");
      }
      const data = await response.json();
      const candidate =
        data.serverUrl || data.server_url || data.server || data.url || null;
      if (candidate) {
        setServerUrl(candidate);
        await setItem(STORAGE_KEYS.serverUrl, candidate);
        checkHealth(candidate);
      }
    } catch (error) {
      setWalletStatus((prev) => ({
        ...prev,
        healthError: "Gist lookup failed.",
      }));
    }
  }, [checkHealth]);

  const signInWithWallet = useCallback(async () => {
    if (!address || !provider) {
      setAuthStatus({ loading: false, error: "Connect a wallet first." });
      return;
    }
    setAuthStatus({ loading: true, error: null });
    try {
      const noncePayload = await withTimeout(
        apiPost(serverUrl, "/api/auth/wallet/nonce", { address }),
        15000,
        "Nonce request"
      );
      const message = noncePayload.message;
      const signature = await withTimeout(
        provider.request({
          method: "personal_sign",
          params: [message, address],
        }),
        20000,
        "Wallet signature"
      );
      const authPayload = await withTimeout(
        apiPost(serverUrl, "/api/auth/wallet/verify", { address, signature }),
        15000,
        "Verify request"
      );
      await setItem(STORAGE_KEYS.authToken, authPayload.token);
      await setItem(STORAGE_KEYS.authWallet, authPayload.wallet || address);
      setToken(authPayload.token);
      setWallet(authPayload.wallet || address);
      setCredits(authPayload.credits || 0);
      setAuthStatus({ loading: false, error: null });
    } catch (error) {
      setAuthStatus({
        loading: false,
        error: error?.message || "Wallet sign-in failed.",
      });
    }
  }, [address, provider, serverUrl]);

  const disconnectWallet = useCallback(async () => {
    try {
      if (provider?.disconnect) {
        await provider.disconnect();
      }
    } catch (error) {
      console.error("Wallet disconnect failed.", error);
    }
    await removeItem(STORAGE_KEYS.authToken);
    await removeItem(STORAGE_KEYS.authWallet);
    setToken(null);
    setWallet(null);
    setCredits(0);
  }, [provider]);

  const headerRight = (
    <Text style={{ color: colors.mutedGold, fontSize: 12 }}>
      Credits: {credits}
    </Text>
  );

  const serverStatusLabel = walletStatus.healthError
    ? walletStatus.healthError
    : walletStatus.health
    ? `Server ${walletStatus.health}`
    : "Server ready";
  const serverOnline = !walletStatus.healthError;
  const goToSettings = useCallback(() => setActiveTab("settings"), [setActiveTab]);
  const goToBestiary = useCallback(() => setActiveTab("bestiary"), [setActiveTab]);
  const openCharacterCreator = useCallback(() => setCreationVisible(true), []);
  const closeCharacterCreator = useCallback(() => setCreationVisible(false), []);
  const [pendingCharacterEntry, setPendingCharacterEntry] = useState(null);
  const [pendingSessionEntry, setPendingSessionEntry] = useState(null);
  const handleCharacterCreated = useCallback(
    (character) => {
      closeCharacterCreator();
      setActiveTab("story");
      setPendingCharacterEntry({ ...character, timestamp: Date.now() });
    },
    [closeCharacterCreator, setActiveTab]
  );
  const handleStoryEntryConsumed = useCallback(() => {
    setPendingCharacterEntry(null);
  }, []);
  const handleSessionEntryConsumed = useCallback(() => {
    setPendingSessionEntry(null);
  }, []);
  const openSessions = useCallback(async () => {
    setSessionsVisible(true);
    setSessionsLoading(true);
    const stored = await getJson(STORAGE_KEYS.sessions, []);
    const sorted = [...stored].sort(
      (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0)
    );
    setSessionList(sorted);
    setSessionsLoading(false);
  }, []);
  const closeSessions = useCallback(() => setSessionsVisible(false), []);
  const handleSessionSelect = useCallback(
    (entry) => {
      setPendingSessionEntry({ ...entry, timestamp: Date.now() });
      setSessionsVisible(false);
      setActiveTab("story");
    },
    [setActiveTab]
  );
  const actionButtons = useMemo(
    () => [
      {
        id: "new-game",
        label: "New Game",
        variant: "primary",
        onPress: openCharacterCreator,
      },
      {
        id: "sessions",
        label: "Sessions",
        variant: "ghost",
        onPress: openSessions,
      },
    ],
    [openSessions, openCharacterCreator]
  );
  const activeContent = useMemo(() => {
    switch (activeTab) {
      case "story":
      return (
        <StoryScreen
          serverUrl={serverUrl}
          onCreditsUpdate={setCredits}
          onNavigate={setActiveTab}
          characterEntry={pendingCharacterEntry}
          onCharacterEntryHandled={handleStoryEntryConsumed}
          sessionEntry={pendingSessionEntry}
          onSessionEntryHandled={handleSessionEntryConsumed}
        />
      );
      case "spells":
        return <SpellsScreen serverUrl={serverUrl} />;
      case "bestiary":
        return <BestiaryScreen serverUrl={serverUrl} />;
      case "settings":
        return (
          <SettingsScreen
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            onSaveServerUrl={saveServerUrl}
            onRefreshServerUrl={refreshServerUrl}
            onSelectServerUrl={applyServerUrl}
            presets={{ local: LOCAL_SERVER_URL, prod: PROD_SERVER_URL }}
            updateStatus={updateStatus}
            onSignOut={disconnectWallet}
            credits={credits}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    serverUrl,
    setCredits,
    pendingCharacterEntry,
    handleStoryEntryConsumed,
    pendingSessionEntry,
    handleSessionEntryConsumed,
    handleCharacterCreated,
    saveServerUrl,
    refreshServerUrl,
    applyServerUrl,
    updateStatus,
    disconnectWallet,
    credits,
  ]);

  if (!fontsLoaded) {
    return (
      <>
        <StatusBar hidden />
        <View style={{ flex: 1, backgroundColor: colors.ink }} />
      </>
    );
  }

  if (!token) {
    return (
      <>
        <StatusBar hidden />
        <AuthScreen
          serverUrl={serverUrl}
          setServerUrl={setServerUrl}
          onSaveServerUrl={saveServerUrl}
          onRefreshServerUrl={refreshServerUrl}
          walletStatus={walletStatus}
          walletAddress={wallet || address}
          walletConnected={isConnected}
          onOpenWallet={open}
          authStatus={authStatus}
          onSignIn={signInWithWallet}
          onDisconnect={disconnectWallet}
          updateStatus={updateStatus}
        />
        <WalletConnectModal
          projectId={WALLETCONNECT_PROJECT_ID}
          providerMetadata={WALLETCONNECT_METADATA}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar hidden />
      <HomeScreen
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        headerRight={headerRight}
        statusOnline={serverOnline}
        statusLabel={serverStatusLabel}
        onSettingsPress={goToSettings}
        onCartPress={goToBestiary}
        actions={actionButtons}
        bodyStyle={activeTab === "story" ? STORY_BODY_STYLE : undefined}
      >
        {activeContent}
      </HomeScreen>
      <Modal
        visible={creationVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={closeCharacterCreator}
      >
        <SafeAreaView style={modalStyles.fullScreen}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Character Creation</Text>
            <Pressable onPress={closeCharacterCreator} style={modalStyles.closeButton}>
              <Text style={modalStyles.closeLabel}>Close</Text>
            </Pressable>
          </View>
          <View style={modalStyles.modalBody}>
            <CharacterScreen
              serverUrl={serverUrl}
              onCharacterCreated={handleCharacterCreated}
            />
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={sessionsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={closeSessions}
      >
        <View style={modalStyles.fullScreen}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Sessions</Text>
            <Pressable onPress={closeSessions} style={modalStyles.closeButton}>
              <Text style={modalStyles.closeLabel}>Close</Text>
            </Pressable>
          </View>
          <View style={modalStyles.modalBody}>
            {sessionsLoading ? (
              <Text style={modalStyles.emptyLabel}>Loading sessions...</Text>
            ) : sessionList.length ? (
              <ScrollView contentContainerStyle={modalStyles.sessionList}>
                {sessionList.map((session) => (
                  <Pressable
                    key={session.id}
                    style={modalStyles.sessionCard}
                    onPress={() => handleSessionSelect(session)}
                  >
                    <Text style={modalStyles.sessionTitle}>
                      {session.title || "Adventure"}
                    </Text>
                    {session.preview ? (
                      <Text style={modalStyles.sessionPreview}>
                        {session.preview}
                      </Text>
                    ) : null}
                    <Text style={modalStyles.sessionMeta}>
                      {session.updatedAt
                        ? new Date(session.updatedAt).toLocaleString()
                        : "Saved"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={modalStyles.emptyLabel}>No sessions yet.</Text>
            )}
          </View>
        </View>
      </Modal>
      <WalletConnectModal
        projectId={WALLETCONNECT_PROJECT_ID}
        providerMetadata={WALLETCONNECT_METADATA}
      />
    </>
  );
}

const modalStyles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.panel,
    justifyContent: "flex-start",
    alignItems: "stretch",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.parchment,
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: 0,
  },
  closeLabel: {
    color: colors.gold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  modalBody: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: spacing.lg,
    minHeight: 0,
  },
  sessionList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sessionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panelAlt,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sessionTitle: {
    color: colors.parchment,
    fontSize: 14,
    fontWeight: "700",
  },
  sessionPreview: {
    color: colors.mutedGold,
    fontSize: 12,
    lineHeight: 16,
  },
  sessionMeta: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  emptyLabel: {
    color: colors.mutedGold,
    fontSize: 12,
    padding: spacing.lg,
  },
});
