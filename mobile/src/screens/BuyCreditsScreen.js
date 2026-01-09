import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import { apiGet, apiPost } from "../api/client";
import { colors, radius, spacing } from "../theme";

const FALLBACK_PACKS = [
  { credits: 100, amount: "1.00" },
  { credits: 400, amount: "4.00" },
  { credits: 1000, amount: "10.00" },
];

export default function BuyCreditsScreen({
  serverUrl,
  onCreditsUpdate,
  onOpenWallet,
}) {
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  const [selectedPack, setSelectedPack] = useState(FALLBACK_PACKS[0]);
  const [wallet, setWallet] = useState("");
  const [contract, setContract] = useState("");
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPacks = useCallback(async () => {
    setError("");
    try {
      const payload = await apiGet(serverUrl, "/api/payments/packs");
      if (payload?.wallet) setWallet(payload.wallet);
      if (payload?.usdt_contract) setContract(payload.usdt_contract);
      if (Array.isArray(payload?.packs) && payload.packs.length) {
        setPacks(payload.packs);
        setSelectedPack(payload.packs[0]);
      }
    } catch (err) {
      setError("Failed to load packs. Using default pricing.");
    }
  }, [serverUrl]);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const handlePurchase = useCallback(
    async (credits) => {
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const payload = await apiPost(serverUrl, "/api/payments/create", { credits });
        setOrder(payload);
        setWallet(payload.address || wallet);
        setStatus(`Order created for ${credits} credits.`);
      } catch (err) {
        const message = String(err?.message || "Payment failed.");
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [serverUrl, wallet]
  );

  const refreshStatus = useCallback(async () => {
    if (!order?.order_id) {
      setError("Create an order first to check status.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await apiGet(serverUrl, `/api/payments/status/${order.order_id}`);
      setOrder((prev) => ({ ...prev, ...payload }));
      setStatus(`Status: ${payload.status}`);
      if (onCreditsUpdate) {
        try {
          const me = await apiGet(serverUrl, "/api/me");
          if (typeof me?.credits === "number") {
            onCreditsUpdate(me.credits);
          }
        } catch (err) {
          // Ignore credit refresh errors so status still shows.
        }
      }
    } catch (err) {
      setError("Failed to check payment status.");
    } finally {
      setBusy(false);
    }
  }, [order, serverUrl, onCreditsUpdate]);

  const headline = useMemo(() => {
    if (order?.amount && order?.address) {
      return `Send ${order.amount} USDT to the address below.`;
    }
    return "Select a credit pack to create a payment.";
  }, [order]);

  const openTrustWallet = useCallback(async () => {
    try {
      await Linking.openURL("trust://");
    } catch (err) {
      setError("Open Trust Wallet failed. Please open it manually.");
    }
  }, []);

  const handleShare = useCallback(async (value, label) => {
    if (!value) return;
    try {
      await Share.share({ message: String(value) });
      setStatus(`${label} ready to copy.`);
    } catch (err) {
      setError("Copy failed. Long-press to select instead.");
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Buy Credits</Text>
      <Text style={styles.subtitle}>{headline}</Text>
      <View style={styles.walletRow}>
        <Text style={styles.walletLabel}>Wallet</Text>
        <Text style={styles.walletText}>WalletConnect is optional.</Text>
        <Text style={styles.walletText}>Use it if you want to open Trust Wallet.</Text>
        <Button label="Open WalletConnect" onPress={onOpenWallet} variant="ghost" />
      </View>

      {packs.map((pack) => (
        <View key={pack.credits} style={styles.packRow}>
          <View style={styles.packInfo}>
            <Text style={styles.packTitle}>{pack.credits} credits</Text>
            <Text style={styles.packPrice}>${pack.amount}</Text>
          </View>
          <Button
            label={selectedPack?.credits === pack.credits ? "Selected" : "Select"}
            onPress={() => setSelectedPack(pack)}
            disabled={busy}
            variant={selectedPack?.credits === pack.credits ? "primary" : "ghost"}
          />
        </View>
      ))}
      <Button
        label={busy ? "Confirming..." : "Confirm Buy"}
        onPress={() => handlePurchase(selectedPack?.credits)}
        disabled={busy || !selectedPack}
      />

      {order ? (
        <View style={styles.orderBox}>
          <Text style={styles.orderLabel}>Payment details</Text>
          <View style={styles.orderRow}>
            <Text style={styles.orderText} selectable>
              Address: {order.address || wallet || "Unknown"}
            </Text>
            <Button
              label="Copy"
              onPress={() => handleShare(order.address, "Address")}
              variant="ghost"
              style={styles.iconButton}
            />
          </View>
          <View style={styles.orderRow}>
            <Text style={styles.orderText} selectable>
              Amount: {order.amount || "-"} USDT
            </Text>
            <Button
              label="Copy"
              onPress={() => handleShare(order.amount, "Amount")}
              variant="ghost"
              style={styles.iconButton}
            />
          </View>
          {contract ? (
            <Text style={styles.orderText} selectable>
              USDT Contract: {contract}
            </Text>
          ) : null}
          <Text style={styles.orderHint}>Network: Ethereum Mainnet</Text>
          <Button label="Open Wallet" onPress={openTrustWallet} variant="ghost" />
          <Text style={styles.orderHint}>
            Wallets often show 0 ETH for token transfers. The amount is in USDT.
          </Text>
          <Text style={styles.orderHint}>
            Some wallets only show the gas fee at first. That is normal for USDT transfers.
          </Text>
          <Text style={styles.orderHint}>
            Tip: press and hold the address or amount to copy.
          </Text>
          {status ? <Text style={styles.orderStatus}>{status}</Text> : null}
          <Button
            label={busy ? "Checking..." : "Check Status"}
            onPress={refreshStatus}
            disabled={busy}
            variant="ghost"
          />
        </View>
      ) : null}

      <Button
        label={busy ? "Checking..." : "Check Status"}
        onPress={refreshStatus}
        disabled={busy}
        variant="ghost"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>
        Confirm Buy locks in the amount and address. Send USDT to complete the order.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.parchment,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.mutedGold,
    fontSize: 13,
  },
  packRow: {
    width: "100%",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  packInfo: {
    gap: 2,
  },
  packTitle: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 12,
  },
  packPrice: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  orderBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  orderLabel: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  walletRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.xs,
  },
  walletLabel: {
    color: colors.mutedGold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  walletText: {
    color: colors.parchment,
    fontSize: 12,
  },
  orderText: {
    color: colors.parchment,
    fontSize: 12,
    flex: 1,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  iconButton: {
    minWidth: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  orderHint: {
    color: colors.mutedGold,
    fontSize: 11,
  },
  orderStatus: {
    color: colors.gold,
    fontSize: 12,
  },
  error: {
    color: colors.accent,
    fontSize: 12,
  },
  note: {
    color: colors.mutedGold,
    fontSize: 11,
  },
});
