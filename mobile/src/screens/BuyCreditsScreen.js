import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Clipboard, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as RNIap from "react-native-iap";
import Button from "../components/Button";
import { FantasyCard } from "../components/FantasyCard";
import { apiGet, apiPost } from "../api/client";
import { theme } from "../theme";
import { isPlayBuild } from "../buildConfig";

const PLAY_PRODUCTS = [
  { id: "credits_100", credits: 100, label: "100 Credits", fallbackPrice: "$1.00" },
  { id: "credits_400", credits: 400, label: "400 Credits", fallbackPrice: "$4.00" },
  { id: "credits_1000", credits: 1000, label: "1000 Credits", fallbackPrice: "$10.00" },
];

async function safeGetProducts(productIds) {
  if (!productIds?.length) return [];
  if (RNIap?.fetchProducts) {
    try {
      return await RNIap.fetchProducts({ skus: productIds, type: "in-app" });
    } catch (error) {
      // fall through to legacy getters
    }
  }
  if (!RNIap?.getProducts) return [];
  try {
    return await RNIap.getProducts({ skus: productIds });
  } catch (error) {
    try {
      return await RNIap.getProducts(productIds);
    } catch (innerError) {
      return [];
    }
  }
}

async function safeRequestPurchase(productId) {
  if (!RNIap?.requestPurchase) {
    throw new Error("Billing module not available.");
  }
  const request = {
    type: "in-app",
    request: Platform.OS === "android"
      ? { android: { skus: [productId] } }
      : { apple: { sku: productId } },
  };
  try {
    await RNIap.requestPurchase(request);
    return;
  } catch (error) {
    // Legacy fallbacks for older native builds.
    try {
      await RNIap.requestPurchase({ sku: productId });
      return;
    } catch (innerError) {
      await RNIap.requestPurchase({ skus: [productId] });
    }
  }
}

// USDT Payment Screen for Amazon builds
function USDTPaymentScreen({ serverUrl, onCreditsUpdate }) {
  const [packs, setPacks] = useState([]);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ error: null, message: null });
  const [selectedPack, setSelectedPack] = useState(null);
  const [order, setOrder] = useState(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    const fetchPacks = async () => {
      try {
        const data = await apiGet(serverUrl, "/api/payments/packs");
        setPacks(data.packs || []);
        setWallet(data.wallet || "");
      } catch (error) {
        setStatus({ error: error?.message || "Failed to load payment options.", message: null });
      } finally {
        setLoading(false);
      }
    };
    fetchPacks();
  }, [serverUrl]);

  const copyToClipboard = useCallback((text, label) => {
    Clipboard.setString(text);
    Alert.alert("Copied", `${label} copied to clipboard`);
  }, []);

  const createOrder = useCallback(
    async (pack) => {
      setSelectedPack(pack);
      setStatus({ error: null, message: null });
      try {
        const response = await apiPost(serverUrl, "/api/payments/create", {
          credits: pack.credits,
        });
        setOrder(response);
        setStatus({ error: null, message: "Order created! Send USDT to the address below." });

        // Start polling for payment
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusResponse = await apiGet(serverUrl, `/api/payments/status/${response.order_id}`);
            if (statusResponse.status === "completed") {
              clearInterval(pollIntervalRef.current);
              if (statusResponse.credits != null && onCreditsUpdate) {
                onCreditsUpdate(statusResponse.credits);
              }
              setStatus({ error: null, message: "Payment received! Credits added to your account." });
              setOrder(null);
              setSelectedPack(null);
            } else if (statusResponse.status === "failed" || statusResponse.status === "expired") {
              clearInterval(pollIntervalRef.current);
              setStatus({ error: "Payment failed or expired.", message: null });
              setOrder(null);
              setSelectedPack(null);
            }
          } catch (error) {
            // Continue polling on error
          }
        }, 5000);
      } catch (error) {
        setSelectedPack(null);
        const errorMsg = error?.message || "Failed to create payment order.";
        console.error("Payment creation error:", error);
        setStatus({ error: errorMsg, message: null });
      }
    },
    [serverUrl, onCreditsUpdate]
  );

  const cancelOrder = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setOrder(null);
    setSelectedPack(null);
    setStatus({ error: null, message: null });
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (order) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Send USDT Payment</Text>
          <Text style={styles.subtitle}>{selectedPack?.credits} Credits</Text>
        </View>

        <FantasyCard style={styles.paymentCard}>
          <Text style={styles.label}>Send exactly this amount:</Text>
          <TouchableOpacity
            style={styles.copyField}
            onPress={() => copyToClipboard(order.amount, "Amount")}
          >
            <Text style={styles.copyFieldText}>{order.amount} USDT</Text>
            <Text style={styles.copyHint}>Tap to copy</Text>
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: theme.spacing.md }]}>To this address:</Text>
          <TouchableOpacity
            style={styles.copyField}
            onPress={() => copyToClipboard(order.address, "Address")}
          >
            <Text style={styles.copyFieldText}>{order.address}</Text>
            <Text style={styles.copyHint}>Tap to copy</Text>
          </TouchableOpacity>

          <View style={styles.warning}>
            <Text style={styles.warningText}>⚠️ Send the EXACT amount shown above</Text>
            <Text style={styles.warningText}>The unique amount helps us identify your payment</Text>
          </View>
        </FantasyCard>

        <View style={styles.statusBox}>
          <ActivityIndicator color={theme.colors.gold} />
          <Text style={styles.statusText}>Waiting for payment...</Text>
          <Text style={styles.statusSubtext}>This may take a few minutes</Text>
        </View>

        <Button label="Cancel" onPress={cancelOrder} variant="ghost" />
        {status.error ? <Text style={styles.error}>{status.error}</Text> : null}
        {status.message ? <Text style={styles.success}>{status.message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Buy Credits</Text>
        <Text style={styles.subtitle}>Pay with USDT (Ethereum Mainnet)</Text>
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.gold} />
          <Text style={styles.loadingLabel}>Loading offers...</Text>
        </View>
      ) : null}
      <View style={styles.list}>
        {packs.map((pack) => (
          <FantasyCard key={pack.credits} style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{pack.credits} Credits</Text>
              <Text style={styles.cardMeta}>{pack.amount} USDT</Text>
            </View>
            <Button
              label={selectedPack?.credits === pack.credits ? "Processing" : "Buy"}
              onPress={() => createOrder(pack)}
              disabled={selectedPack != null}
              style={styles.buyButton}
            />
          </FantasyCard>
        ))}
      </View>
      {status.error ? <Text style={styles.error}>{status.error}</Text> : null}
      {status.message ? <Text style={styles.success}>{status.message}</Text> : null}
      {wallet ? (
        <Text style={styles.note}>Payments are monitored on the Ethereum Mainnet</Text>
      ) : null}
    </View>
  );
}

// Main component that switches between Play Store IAP and USDT payments
export default function BuyCreditsScreen({ serverUrl, onCreditsUpdate }) {
  // For Amazon builds, show USDT/WalletConnect payment UI
  if (!isPlayBuild) {
    return <USDTPaymentScreen serverUrl={serverUrl} onCreditsUpdate={onCreditsUpdate} />;
  }

  // For Play builds, show Google Play IAP
  const [iapReady, setIapReady] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState({ error: null, message: null });
  const [busyProduct, setBusyProduct] = useState(null);
  const handledTokensRef = useRef(new Set());
  const iapModule = RNIap ?? {};

  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach((product) => map.set(product.productId, product));
    return map;
  }, [products]);

  const refreshProducts = useCallback(async () => {
    setLoadingProducts(true);
    const fetched = await safeGetProducts(PLAY_PRODUCTS.map((item) => item.id));
    if (fetched?.length) {
      setProducts(fetched);
    }
    setLoadingProducts(false);
  }, []);

  const reportPurchase = useCallback(
    async (purchase) => {
      const productId = purchase?.productId;
      if (!productId) return;
      const purchaseToken = purchase?.purchaseToken || null;
      const transactionId = purchase?.transactionId || purchase?.orderId || null;
      const handledKey = purchaseToken || transactionId || productId;
      if (handledTokensRef.current.has(handledKey)) return;
      handledTokensRef.current.add(handledKey);
      try {
        const payload = await apiPost(serverUrl, "/api/payments/play", {
          product_id: productId,
          transaction_id: transactionId,
          purchase_token: purchaseToken,
        });
        if (payload?.credits != null && onCreditsUpdate) {
          onCreditsUpdate(payload.credits);
        }
        setStatus({ error: null, message: "Credits added to your account." });
      } catch (error) {
        handledTokensRef.current.delete(handledKey);
        setStatus({
          error: error?.message || "Purchase verification failed.",
          message: null,
        });
      }
    },
    [onCreditsUpdate, serverUrl]
  );

  useEffect(() => {
    if (typeof iapModule.purchaseUpdatedListener !== "function") {
      setStatus({
        error: "Billing module not available. Reinstall the Play build.",
        message: null,
      });
      return undefined;
    }

    let mounted = true;
    let purchaseSub = null;
    let errorSub = null;

    const init = async () => {
      try {
        if (typeof iapModule.initConnection === "function") {
          await iapModule.initConnection();
        }
        if (!mounted) return;
        setIapReady(true);
        if (Platform.OS === "android" && iapModule.flushFailedPurchasesCachedAsPendingAndroid) {
          await iapModule.flushFailedPurchasesCachedAsPendingAndroid();
        }
        await refreshProducts();
      } catch (error) {
        if (mounted) {
          setStatus({
            error: error?.message || "Billing connection failed.",
            message: null,
          });
        }
      }
    };

    init();

    purchaseSub = iapModule.purchaseUpdatedListener(async (purchase) => {
      await reportPurchase(purchase);
      try {
        if (iapModule.finishTransaction) {
          await iapModule.finishTransaction({ purchase, isConsumable: true });
        }
      } catch (error) {
        // ignore finish errors
      } finally {
        setBusyProduct(null);
      }
    });

    if (typeof iapModule.purchaseErrorListener === "function") {
      errorSub = iapModule.purchaseErrorListener((error) => {
        setBusyProduct(null);
        setStatus({
          error: error?.message || "Purchase failed.",
          message: null,
        });
      });
    }

    return () => {
      mounted = false;
      purchaseSub?.remove?.();
      errorSub?.remove?.();
      if (iapModule.endConnection) {
        iapModule.endConnection();
      }
    };
  }, [iapModule, refreshProducts, reportPurchase]);

  const handleBuy = useCallback(
    async (productId) => {
      if (!iapReady) {
        setStatus({ error: "Billing is still initializing.", message: null });
        return;
      }
      setBusyProduct(productId);
      setStatus({ error: null, message: null });
      try {
        await safeRequestPurchase(productId);
      } catch (error) {
        setBusyProduct(null);
        setStatus({
          error: error?.message || "Purchase failed to start.",
          message: null,
        });
      }
    },
    [iapReady]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Buy Credits</Text>
        <Text style={styles.subtitle}>Google Play billing</Text>
      </View>
      {loadingProducts ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.gold} />
          <Text style={styles.loadingLabel}>Loading offers...</Text>
        </View>
      ) : null}
      <View style={styles.list}>
        {PLAY_PRODUCTS.map((item) => {
          const product = productMap.get(item.id);
          const price =
            product?.localizedPrice ||
            product?.price ||
            product?.oneTimePurchaseOfferDetails?.formattedPrice ||
            item.fallbackPrice;
          return (
            <FantasyCard key={item.id} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardMeta}>{price}</Text>
              </View>
              <Button
                label={busyProduct === item.id ? "Processing" : "Buy"}
                onPress={() => handleBuy(item.id)}
                disabled={busyProduct != null}
                style={styles.buyButton}
              />
            </FantasyCard>
          );
        })}
      </View>
      {status.error ? <Text style={styles.error}>{status.error}</Text> : null}
      {status.message ? <Text style={styles.success}>{status.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
  },
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  title: {
    color: theme.colors.gold,
    fontSize: 24,
    fontFamily: theme.fonts.header,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  loadingLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  list: {
    gap: theme.spacing.md,
  },
  card: {
    padding: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  cardInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: theme.fonts.header,
  },
  cardMeta: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontFamily: theme.fonts.body,
  },
  buyButton: {
    minWidth: 90,
  },
  paymentCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.fonts.body,
    textTransform: 'uppercase',
  },
  copyField: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: theme.layout.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.goldDim,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  copyFieldText: {
    color: theme.colors.gold,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
    fontFamily: theme.fonts.body,
  },
  copyHint: {
    color: theme.colors.textMuted,
    fontSize: 10,
  },
  warning: {
    backgroundColor: 'rgba(138, 28, 28, 0.15)', // Crimson tint
    borderRadius: theme.layout.radius.sm,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.crimson,
  },
  warningText: {
    color: theme.colors.crimsonBright,
    fontSize: 11,
    fontFamily: theme.fonts.body,
  },
  statusBox: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  statusText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  statusSubtext: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.crimson,
    fontSize: 12,
  },
  success: {
    marginTop: theme.spacing.sm,
    color: theme.colors.emerald,
    fontSize: 12,
  },
  note: {
    marginTop: theme.spacing.md,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
});
