import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CharacterScreen from "./src/screens/CharacterScreen";
import BestiaryScreen from "./src/screens/BestiaryScreen";
import BuyCreditsScreen from "./src/screens/BuyCreditsScreen";
import SpellsScreen from "./src/screens/SpellsScreen";
import StoryScreen from "./src/screens/StoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import Screen from "./src/components/Screen";
import { apiGet, apiPost } from "./src/api/client";
import {
  APP_VERSION,
  DEFAULT_SERVER_URL,
  GIST_CONFIG_URL,
  GITHUB_RELEASES_URL,
  GITHUB_RELEASES_PAGE,
  PROD_SERVER_URL,
  GOOGLE_WEB_CLIENT_ID,
  STORAGE_KEYS,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
  WALLETCONNECT_RELAY_URL,
  WALLETCONNECT_SESSION_PARAMS,
} from "./src/config";
import { getItem, getJson, removeItem, setItem, setJson } from "./src/storage";
import { colors, radius, spacing } from "./src/theme";
import { isPlayBuild } from "./src/buildConfig";

const walletConnectModule = isPlayBuild
  ? null
  : require("@walletconnect/modal-react-native");
const useWalletConnectModal = walletConnectModule?.useWalletConnectModal;
const WalletConnectModal = walletConnectModule?.WalletConnectModal;

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

function isLocalUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(String(value));
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return true;
    }
    if (host.endsWith(".local")) return true;
    return false;
  } catch (error) {
    return false;
  }
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

const WALLETCONNECT_STORAGE_KEY = "dc_walletconnect_storage_cleaned";
const WALLETCONNECT_KEY_MARKERS = ["wc@", "walletconnect", "WALLETCONNECT", "w3m", "W3M"];

export default function App() {
  const [fontsLoaded] = useFonts({
    Cinzel_400Regular,
    Cinzel_700Bold,
  });
  const walletConnectState = useWalletConnectModal
    ? useWalletConnectModal()
    : { open: () => {}, provider: null, isConnected: false, address: null };
  const { open, provider, isConnected, address } = walletConnectState;
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [token, setToken] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [accountLabel, setAccountLabel] = useState(null);
  const [credits, setCredits] = useState(0);
  const [activeTab, setActiveTab] = useState("story");
  const [creationVisible, setCreationVisible] = useState(false);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [buyCreditsVisible, setBuyCreditsVisible] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [sessionList, setSessionList] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState({ loading: false, error: null });
  const [walletStatus, setWalletStatus] = useState({});
  const [walletReady, setWalletReady] = useState(false);
  const lastCharacterRequestRef = useRef(null);
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
    if (isLocalUrl(initialServerUrl)) {
      initialServerUrl = PROD_SERVER_URL;
      await setItem(STORAGE_KEYS.serverUrl, initialServerUrl);
    }
    setServerUrl(initialServerUrl);
    const storedCharacter = await getJson(STORAGE_KEYS.lastCharacter, null);
    if (storedCharacter) {
      setCurrentCharacter(storedCharacter);
    }

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
        const provider = String(me?.provider || "").toLowerCase();
        let label = "Account";
        if (provider === "google") {
          label = "Google";
        } else if (provider === "guest" || me?.guest) {
          label = "Guest";
        } else if (me?.wallet) {
          label = "Wallet";
        }
        setAccountLabel(label);
      } catch (error) {
        await removeItem(STORAGE_KEYS.authToken);
        await removeItem(STORAGE_KEYS.authWallet);
        setToken(null);
        setWallet(null);
        setAccountLabel(null);
      }
    } else {
      setAccountLabel(null);
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
    if (!isPlayBuild) return;
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const resetWalletConnectStorage = async () => {
      try {
        const cleaned = await getItem(WALLETCONNECT_STORAGE_KEY, null);
        if (!cleaned) {
          const keys = await AsyncStorage.getAllKeys();
          const targets = keys.filter((key) =>
            WALLETCONNECT_KEY_MARKERS.some((marker) =>
              key.toLowerCase().includes(marker.toLowerCase())
            )
          );
          if (targets.length) {
            await AsyncStorage.multiRemove(targets);
          }
          await setItem(WALLETCONNECT_STORAGE_KEY, "1");
        }
      } catch (error) {
        // Ignore storage cleanup errors to avoid blocking startup.
      } finally {
        if (mounted) {
          setWalletReady(true);
        }
      }
    };
    resetWalletConnectStorage();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const configureNavBar = async () => {
      try {
        const NavigationBar = await import("expo-navigation-bar");
        if (!mounted) return;
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setVisibilityAsync("hidden");
      } catch (error) {
        // Ignore navigation bar failures to avoid blocking app startup.
      }
    };
    configureNavBar();
    return () => {
      mounted = false;
    };
  }, []);

  const saveServerUrl = useCallback(async () => {
    if (isLocalUrl(serverUrl)) {
      setWalletStatus((prev) => ({
        ...prev,
        healthError: "Local servers are disabled. Use the online server.",
      }));
      setServerUrl(PROD_SERVER_URL);
      await setItem(STORAGE_KEYS.serverUrl, PROD_SERVER_URL);
      return;
    }
    await setItem(STORAGE_KEYS.serverUrl, serverUrl);
    checkHealth(serverUrl);
  }, [serverUrl, checkHealth]);

  const applyServerUrl = useCallback(
    async (nextUrl) => {
      if (isLocalUrl(nextUrl)) {
        setWalletStatus((prev) => ({
          ...prev,
          healthError: "Local servers are disabled. Use the online server.",
        }));
        setServerUrl(PROD_SERVER_URL);
        await setItem(STORAGE_KEYS.serverUrl, PROD_SERVER_URL);
        checkHealth(PROD_SERVER_URL);
        return;
      }
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
        if (isLocalUrl(candidate)) {
          setWalletStatus((prev) => ({
            ...prev,
            healthError: "Local servers are disabled. Using online server.",
          }));
          setServerUrl(PROD_SERVER_URL);
          await setItem(STORAGE_KEYS.serverUrl, PROD_SERVER_URL);
          checkHealth(PROD_SERVER_URL);
          return;
        }
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
      let signature = null;
      let typedData = null;
      try {
        signature = await withTimeout(
          provider.request({
            method: "personal_sign",
            params: [message, address],
          }),
          20000,
          "Wallet signature"
        );
      } catch (err) {
        try {
          signature = await withTimeout(
            provider.request({
              method: "personal_sign",
              params: [address, message],
            }),
            20000,
            "Wallet signature"
          );
        } catch (innerErr) {
          try {
            signature = await withTimeout(
              provider.request({
                method: "eth_sign",
                params: [address, message],
              }),
              20000,
              "Wallet signature"
            );
          } catch (signErr) {
            typedData = {
              types: {
                EIP712Domain: [
                  { name: "name", type: "string" },
                  { name: "version", type: "string" },
                  { name: "chainId", type: "uint256" },
                  { name: "verifyingContract", type: "address" },
                ],
                Signin: [{ name: "contents", type: "string" }],
              },
              domain: {
                name: "Side Quest",
                version: "1",
                chainId: 1,
                verifyingContract: "0x0000000000000000000000000000000000000000",
              },
              primaryType: "Signin",
              message: {
                contents: message,
              },
            };
            try {
              signature = await withTimeout(
                provider.request({
                  method: "eth_signTypedData_v4",
                  params: [address, JSON.stringify(typedData)],
                }),
                20000,
                "Wallet signature"
              );
            } catch (typedErr) {
              try {
                signature = await withTimeout(
                  provider.request({
                    method: "eth_signTypedData",
                    params: [address, typedData],
                  }),
                  20000,
                  "Wallet signature"
                );
              } catch (typedFallbackErr) {
                signature = await withTimeout(
                  provider.request({
                    method: "eth_signTypedData_v3",
                    params: [address, JSON.stringify(typedData)],
                  }),
                  20000,
                  "Wallet signature"
                );
              }
            }
          }
        }
      }
      const authPayload = await withTimeout(
        apiPost(serverUrl, "/api/auth/wallet/verify", {
          address,
          signature,
          typed_data: typedData,
        }),
        15000,
        "Verify request"
      );
      await setItem(STORAGE_KEYS.authToken, authPayload.token);
      await setItem(STORAGE_KEYS.authWallet, authPayload.wallet || address);
      setToken(authPayload.token);
      setWallet(authPayload.wallet || address);
      setCredits(authPayload.credits || 0);
      setAccountLabel("Wallet");
      setAuthStatus({ loading: false, error: null });
      const storedCharacter = await getJson(STORAGE_KEYS.lastCharacter, null);
      if (!storedCharacter) {
        setActiveTab("story");
        setCreationVisible(true);
      }
    } catch (error) {
      setAuthStatus({
        loading: false,
        error: error?.message || "Wallet sign-in failed.",
      });
    }
  }, [address, provider, serverUrl]);

  const signInWithGoogle = useCallback(async () => {
    if (!isPlayBuild) {
      setAuthStatus({ loading: false, error: "Google sign-in unavailable." });
      return;
    }
    setAuthStatus({ loading: true, error: null });
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens?.idToken || userInfo?.idToken;
      if (!idToken) {
        throw new Error("Missing Google ID token.");
      }
      const authPayload = await withTimeout(
        apiPost(serverUrl, "/api/auth/google", { id_token: idToken }),
        15000,
        "Google sign-in"
      );
      await setItem(STORAGE_KEYS.authToken, authPayload.token);
      await removeItem(STORAGE_KEYS.authWallet);
      setToken(authPayload.token);
      setWallet(null);
      setCredits(authPayload.credits || 0);
      setAccountLabel("Google");
      setAuthStatus({ loading: false, error: null });
      const storedCharacter = await getJson(STORAGE_KEYS.lastCharacter, null);
      if (!storedCharacter) {
        setActiveTab("story");
        setCreationVisible(true);
      }
    } catch (error) {
      setAuthStatus({
        loading: false,
        error: error?.message || "Google sign-in failed.",
      });
    }
  }, [serverUrl]);

  const signInAsGuest = useCallback(async () => {
    setAuthStatus({ loading: true, error: null });
    try {
      const authPayload = await withTimeout(
        apiPost(serverUrl, "/api/auth/guest", {}),
        15000,
        "Guest sign-in"
      );
      await setItem(STORAGE_KEYS.authToken, authPayload.token);
      await removeItem(STORAGE_KEYS.authWallet);
      setToken(authPayload.token);
      setWallet(null);
      setCredits(authPayload.credits || 0);
      setAccountLabel("Guest");
      setAuthStatus({ loading: false, error: null });
      const storedCharacter = await getJson(STORAGE_KEYS.lastCharacter, null);
      if (!storedCharacter) {
        setActiveTab("story");
        setCreationVisible(true);
      }
    } catch (error) {
      setAuthStatus({
        loading: false,
        error: error?.message || "Guest sign-in failed.",
      });
    }
  }, [serverUrl]);

  const disconnectWallet = useCallback(async () => {
    try {
      if (isPlayBuild) {
        try {
          await GoogleSignin.signOut();
        } catch (error) {
          // Ignore Google sign-out failures.
        }
      }
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
    setAccountLabel(null);
  }, [provider]);

  const resetWallet = useCallback(async () => {
    try {
      if (provider?.signer?.client?.pairing?.getPairings) {
        const pairings = provider.signer.client.pairing.getPairings();
        for (const pairing of pairings) {
          try {
            await provider.signer.client.pairing.delete(pairing.topic, {
              code: 6000,
              message: "User reset wallet pairing",
            });
          } catch (err) {
            // ignore pairing delete errors
          }
        }
      }
      if (provider?.disconnect) {
        await provider.disconnect();
      }
    } catch (error) {
      console.error("Wallet reset failed.", error);
    }
    try {
      const keys = await AsyncStorage.getAllKeys();
      const targets = keys.filter((key) =>
        WALLETCONNECT_KEY_MARKERS.some((marker) =>
          key.toLowerCase().includes(marker.toLowerCase())
        )
      );
      if (targets.length) {
        await AsyncStorage.multiRemove(targets);
      }
      await setItem(WALLETCONNECT_STORAGE_KEY, "1");
    } catch (error) {
      // Ignore storage cleanup errors.
    }
    await removeItem(STORAGE_KEYS.authToken);
    await removeItem(STORAGE_KEYS.authWallet);
    setToken(null);
    setWallet(null);
    setCredits(0);
    setAccountLabel(null);
  }, [provider]);

  const headerRight = (
    <Text style={{ color: colors.mutedGold, fontSize: 12 }}>
      Credits: {credits}
    </Text>
  );
  const headerTitle = useMemo(() => {
    if (!currentCharacter?.name) return "Side Quest";
    const level = Number(currentCharacter?.level) || 1;
    return `${currentCharacter.name} Lvl ${level}`;
  }, [currentCharacter]);

  const serverStatusLabel = walletStatus.healthError
    ? walletStatus.healthError
    : walletStatus.health
    ? `Server ${walletStatus.health}`
    : "Server ready";
  const serverOnline = !walletStatus.healthError;
  const goToSettings = useCallback(() => setActiveTab("settings"), [setActiveTab]);
  const goToBestiary = useCallback(() => setActiveTab("bestiary"), [setActiveTab]);
  const openBuyCredits = useCallback(() => setBuyCreditsVisible(true), []);
  const closeBuyCredits = useCallback(() => setBuyCreditsVisible(false), []);
  const openCharacterCreator = useCallback(() => setCreationVisible(true), []);
  const closeCharacterCreator = useCallback(() => setCreationVisible(false), []);
  const openWallet = useCallback(() => {
    if (isPlayBuild) {
      setAuthStatus({
        loading: false,
        error: "WalletConnect is disabled on this build.",
      });
      return;
    }
    if (!walletReady) {
      setAuthStatus({
        loading: false,
        error: "WalletConnect is starting. Try again in a moment.",
      });
      return;
    }
    open();
  }, [open, walletReady]);
  const [pendingCharacterEntry, setPendingCharacterEntry] = useState(null);
  const [pendingSessionEntry, setPendingSessionEntry] = useState(null);
  const [resetSessionToken, setResetSessionToken] = useState(0);
  const handleCharacterCreated = useCallback(
    (character) => {
      const requestId =
        character?.requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (requestId && lastCharacterRequestRef.current === requestId) {
        return;
      }
      if (pendingCharacterEntry && Date.now() - pendingCharacterEntry.timestamp < 5000) {
        return;
      }
      if (requestId) {
        lastCharacterRequestRef.current = requestId;
      }
      closeCharacterCreator();
      setActiveTab("story");
      setPendingCharacterEntry({ ...character, requestId, timestamp: Date.now() });
      setResetSessionToken(Date.now());
      setCurrentCharacter(character);
      setJson(STORAGE_KEYS.lastCharacter, character);
    },
    [closeCharacterCreator, setActiveTab, pendingCharacterEntry]
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
  const deleteSession = useCallback((entry) => {
    if (!entry?.id) return;
    Alert.alert(
      "Delete session?",
      "This will remove the session from your history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const stored = await getJson(STORAGE_KEYS.sessions, []);
            const next = stored.filter((session) => session.id !== entry.id);
            await setJson(STORAGE_KEYS.sessions, next);
            setSessionList(next);
            const lastSession = await getJson(STORAGE_KEYS.lastSession, null);
            if (lastSession === entry.id) {
              await removeItem(STORAGE_KEYS.lastSession);
            }
          },
        },
      ]
    );
  }, []);
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
  const activeContent = useMemo(
    () => (
      <View style={appStyles.tabContainer}>
        <View
          style={[
            appStyles.tabPane,
            activeTab === "story" ? appStyles.tabPaneActive : appStyles.tabPaneHidden,
          ]}
          pointerEvents={activeTab === "story" ? "auto" : "none"}
        >
          <StoryScreen
            serverUrl={serverUrl}
            onCreditsUpdate={setCredits}
            onNavigate={setActiveTab}
            characterEntry={pendingCharacterEntry}
            onCharacterEntryHandled={handleStoryEntryConsumed}
            sessionEntry={pendingSessionEntry}
            onSessionEntryHandled={handleSessionEntryConsumed}
            resetSessionToken={resetSessionToken}
            currentCharacter={currentCharacter}
          />
        </View>
        <View
          style={[
            appStyles.tabPane,
            activeTab === "spells" ? appStyles.tabPaneActive : appStyles.tabPaneHidden,
          ]}
          pointerEvents={activeTab === "spells" ? "auto" : "none"}
        >
          <SpellsScreen serverUrl={serverUrl} characterClass={currentCharacter?.klass} />
        </View>
        <View
          style={[
            appStyles.tabPane,
            activeTab === "bestiary" ? appStyles.tabPaneActive : appStyles.tabPaneHidden,
          ]}
          pointerEvents={activeTab === "bestiary" ? "auto" : "none"}
        >
          <BestiaryScreen serverUrl={serverUrl} />
        </View>
        <View
          style={[
            appStyles.tabPane,
            activeTab === "settings" ? appStyles.tabPaneActive : appStyles.tabPaneHidden,
          ]}
          pointerEvents={activeTab === "settings" ? "auto" : "none"}
        >
          <SettingsScreen
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            onSaveServerUrl={saveServerUrl}
            onRefreshServerUrl={refreshServerUrl}
            onSelectServerUrl={applyServerUrl}
            presets={{ prod: PROD_SERVER_URL }}
            updateStatus={updateStatus}
            onSignOut={disconnectWallet}
            accountLabel={accountLabel}
            credits={credits}
          />
        </View>
      </View>
    ),
    [
      activeTab,
      serverUrl,
      setCredits,
      pendingCharacterEntry,
      handleStoryEntryConsumed,
      pendingSessionEntry,
      handleSessionEntryConsumed,
      resetSessionToken,
      saveServerUrl,
      refreshServerUrl,
      applyServerUrl,
      updateStatus,
      disconnectWallet,
      accountLabel,
      credits,
    ]
  );

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
          onOpenWallet={openWallet}
          authStatus={authStatus}
          onSignIn={signInWithWallet}
          onGoogleSignIn={signInWithGoogle}
          onGuestSignIn={signInAsGuest}
          onDisconnect={disconnectWallet}
          onResetWallet={resetWallet}
          accountLabel={accountLabel}
          showWalletConnect={!isPlayBuild}
          showGoogleSignIn={isPlayBuild}
          updateStatus={updateStatus}
        />
        {WalletConnectModal && !isPlayBuild ? (
          <WalletConnectModal
            projectId={WALLETCONNECT_PROJECT_ID}
            providerMetadata={WALLETCONNECT_METADATA}
            relayUrl={WALLETCONNECT_RELAY_URL}
            sessionParams={WALLETCONNECT_SESSION_PARAMS}
          />
        ) : null}
      </>
    );
  }

  if (creationVisible) {
    return (
      <>
        <StatusBar hidden />
        <Screen>
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
        </Screen>
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
        headerTitle={headerTitle}
        statusOnline={serverOnline}
        statusLabel={serverStatusLabel}
        onSettingsPress={goToSettings}
        onCartPress={openBuyCredits}
        actions={actionButtons}
        bodyStyle={activeTab === "story" ? STORY_BODY_STYLE : undefined}
      >
        {activeContent}
      </HomeScreen>
      <Modal
        visible={buyCreditsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={closeBuyCredits}
      >
        <View style={modalStyles.fullScreen}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Buy Credits</Text>
            <Pressable onPress={closeBuyCredits} style={modalStyles.closeButton}>
              <Text style={modalStyles.closeLabel}>Close</Text>
            </Pressable>
          </View>
          <View style={modalStyles.modalBody}>
            <BuyCreditsScreen
              serverUrl={serverUrl}
              onCreditsUpdate={setCredits}
              onOpenWallet={openWallet}
            />
          </View>
        </View>
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
                      {(() => {
                        const character = session.character || null;
                        const name = character?.name;
                        const klass = character?.klass;
                        const level = Number(character?.level) || 1;
                        const headerLabel = name
                          ? `${name} | ${klass || "Hero"} | Lvl ${level}`
                          : session.title || "Adventure";
                        const preview = session.preview || "No recent events yet.";
                        return (
                          <>
                            <View style={modalStyles.sessionHeaderRow}>
                              <Text style={modalStyles.sessionTitle}>{headerLabel}</Text>
                              <Pressable
                                onPress={(event) => {
                                  event?.stopPropagation?.();
                                  deleteSession(session);
                                }}
                                style={modalStyles.sessionDelete}
                              >
                                <Text style={modalStyles.sessionDeleteLabel}>Delete</Text>
                              </Pressable>
                            </View>
                            <Text style={modalStyles.sessionPreview}>{preview}</Text>
                          </>
                        );
                      })()}
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
  sessionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sessionTitle: {
    color: colors.parchment,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  sessionDelete: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  sessionDeleteLabel: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
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

const appStyles = StyleSheet.create({
  tabContainer: {
    flex: 1,
  },
  tabPane: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabPaneActive: {
    opacity: 1,
  },
  tabPaneHidden: {
    opacity: 0,
  },
});
