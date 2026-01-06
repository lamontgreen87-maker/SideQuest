import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useFonts, Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { WalletConnectModal, useWalletConnectModal } from "@walletconnect/modal-react-native";
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import PlaceholderScreen from "./src/screens/PlaceholderScreen";
import ChecksScreen from "./src/screens/ChecksScreen";
import BestiaryScreen from "./src/screens/BestiaryScreen";
import SpellsScreen from "./src/screens/SpellsScreen";
import CharacterScreen from "./src/screens/CharacterScreen";
import StoryScreen from "./src/screens/StoryScreen";
import { apiGet, apiPost } from "./src/api/client";
import {
  APP_VERSION,
  DEFAULT_SERVER_URL,
  GIST_CONFIG_URL,
  GITHUB_RELEASES_URL,
  GITHUB_RELEASES_PAGE,
  STORAGE_KEYS,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
} from "./src/config";
import { getItem, removeItem, setItem } from "./src/storage";
import { colors } from "./src/theme";

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
      { id: "checks", label: "Checks" },
      { id: "spells", label: "Spells" },
      { id: "bestiary", label: "Bestiary" },
      { id: "character", label: "Character" },
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
    const storedServer = await getItem(STORAGE_KEYS.serverUrl, DEFAULT_SERVER_URL);
    const storedToken = await getItem(STORAGE_KEYS.authToken, null);
    const storedWallet = await getItem(STORAGE_KEYS.authWallet, null);
    if (storedServer) {
      setServerUrl(storedServer);
      checkHealth(storedServer);
    }
    if (storedToken) {
      setToken(storedToken);
      setWallet(storedWallet);
      try {
        const me = await apiGet(storedServer || DEFAULT_SERVER_URL, "/api/me");
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

  const saveServerUrl = useCallback(async () => {
    await setItem(STORAGE_KEYS.serverUrl, serverUrl);
    checkHealth(serverUrl);
  }, [serverUrl, checkHealth]);

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
      const noncePayload = await apiPost(serverUrl, "/api/auth/wallet/nonce", {
        address,
      });
      const message = noncePayload.message;
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, address],
      });
      const authPayload = await apiPost(serverUrl, "/api/auth/wallet/verify", {
        address,
        signature,
      });
      await setItem(STORAGE_KEYS.authToken, authPayload.token);
      await setItem(STORAGE_KEYS.authWallet, authPayload.wallet || address);
      setToken(authPayload.token);
      setWallet(authPayload.wallet || address);
      setCredits(authPayload.credits || 0);
      setAuthStatus({ loading: false, error: null });
    } catch (error) {
      setAuthStatus({ loading: false, error: "Wallet sign-in failed." });
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

  const activeContent = useMemo(() => {
    switch (activeTab) {
      case "story":
        return <StoryScreen serverUrl={serverUrl} onCreditsUpdate={setCredits} />;
      case "checks":
        return <ChecksScreen serverUrl={serverUrl} />;
      case "spells":
        return <SpellsScreen serverUrl={serverUrl} />;
      case "bestiary":
        return <BestiaryScreen serverUrl={serverUrl} />;
      case "character":
        return <CharacterScreen serverUrl={serverUrl} />;
      case "settings":
        return (
          <PlaceholderScreen
            title="Settings"
            detail="Version, server, and account tools live here."
          />
        );
      default:
        return null;
    }
  }, [activeTab]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }} />
    );
  }

  if (!token) {
    return (
      <>
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
      <HomeScreen
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        headerRight={headerRight}
      >
        {activeContent}
      </HomeScreen>
      <WalletConnectModal
        projectId={WALLETCONNECT_PROJECT_ID}
        providerMetadata={WALLETCONNECT_METADATA}
      />
    </>
  );
}
