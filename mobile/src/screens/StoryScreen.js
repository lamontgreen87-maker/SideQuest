import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../components/Button";
import { apiGet, apiPost } from "../api/client";
import { INTRO_PROMPTS, STORAGE_KEYS } from "../config";
import { getJson, setJson } from "../storage";
import { colors, radius, spacing } from "../theme";
import { DEFAULT_ENEMIES, DEFAULT_PREMADES } from "../data/dnd";

const storyCache = {
  messages: [],
  sessionId: null,
};

const DRAWER_COLLAPSED_HEIGHT = 48;
const DRAWER_EXPANDED_HEIGHT = 360;
const DRAWER_CONTENT_HEIGHT = DRAWER_EXPANDED_HEIGHT - DRAWER_COLLAPSED_HEIGHT;
const RULES_PROMPT =
  "You know the D&D 5e ruleset (ability scores, checks, combat flow, spellcasting, etc.) and that the player wants a raw, uncensored adventure. Keep acting as the GM with those constraints in mind.";

function pickIntro() {
  const index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

export default function StoryScreen({
  serverUrl,
  onCreditsUpdate,
  onNavigate,
  characterEntry,
  onCharacterEntryHandled,
}) {
  const [sessionId, setSessionId] = useState(storyCache.sessionId);
  const [messages, setMessages] = useState(
    storyCache.messages.length ? storyCache.messages : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pcs, setPcs] = useState([]);
  const [pcId, setPcId] = useState(null);
  const [enemyId, setEnemyId] = useState(null);
  const [rulesSessionId, setRulesSessionId] = useState(null);
  const [weaponId, setWeaponId] = useState(null);
  const [weaponOptions, setWeaponOptions] = useState([]);
  const [combatBusy, setCombatBusy] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const drawerAnimation = useRef(new Animated.Value(0)).current;
  const [checkMode, setCheckMode] = useState("skill");
  const [checkSkill, setCheckSkill] = useState("");
  const [checkAbility, setCheckAbility] = useState("");
  const [checkSave, setCheckSave] = useState("");
  const [checkDc, setCheckDc] = useState("15");
  const [checkContext, setCheckContext] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkUsed, setCheckUsed] = useState(false);
  const [rulesSeeded, setRulesSeeded] = useState(false);

  const loadSession = useCallback(async () => {
    const storedId = await getJson(STORAGE_KEYS.lastSession, null);
    if (storedId) {
      setSessionId(storedId);
      return;
    }
    const intro = pickIntro();
    setMessages([{ role: "assistant", content: RULES_PROMPT }, { role: "assistant", content: intro }]);
    setRulesSeeded(true);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!rulesSeeded && messages.length && messages[0]?.content !== RULES_PROMPT) {
      setMessages((prev) => [{ role: "assistant", content: RULES_PROMPT }, ...prev]);
      setRulesSeeded(true);
    }
  }, [messages, rulesSeeded]);

  const loadCombatCatalogs = useCallback(async () => {
    try {
      const [premades, bestiary] = await Promise.all([
        apiGet(serverUrl, "/api/rules/premades"),
        apiGet(serverUrl, "/api/bestiary"),
      ]);
      const premadeSource =
        premades ||
        DEFAULT_PREMADES.reduce((acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        }, {});
      const bestiarySource =
        bestiary ||
        DEFAULT_ENEMIES.reduce((acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        }, {});
      const pcList = Object.entries(premadeSource).map(([id, payload]) => ({
        id,
        name: payload.name,
      }));
      const enemyList = Object.entries(bestiarySource).map(([id, payload]) => ({
        id,
        name: payload.name,
      }));
      setPcs(pcList);
      if (!pcId && pcList[0]) setPcId(pcList[0].id);
      if (!enemyId && enemyList[0]) setEnemyId(enemyList[0].id);
    } catch (error) {
      console.error("Failed to load combat catalogs", error);
    }
  }, [serverUrl, pcId, enemyId]);

  useEffect(() => {
    loadCombatCatalogs();
  }, [loadCombatCatalogs]);

  const createRulesSession = useCallback(
    async (announce = false) => {
      if (!pcId || !enemyId) {
        throw new Error("Select a combatant first.");
      }
      const response = await apiPost(serverUrl, "/api/rules/sessions", {
        pc_id: pcId,
        enemy_id: enemyId,
      });
      setRulesSessionId(response.session_id);
      const weaponEntries = response?.pc?.weapons || {};
      const weaponKeys = Object.keys(weaponEntries);
      setWeaponOptions(
        weaponKeys.map((key) => ({
          id: key,
          name: weaponEntries[key]?.name || weaponEntries[key]?.label || key,
        }))
      );
      setWeaponId(weaponKeys[0] || null);
      if (announce) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Combat starts: ${response.pc?.name} vs ${response.enemy?.name}.`,
          },
        ]);
      }
      return response.session_id;
    },
    [serverUrl, pcId, enemyId]
  );

  const ensureRulesSession = useCallback(
    async (announce = false) => {
      if (rulesSessionId) return rulesSessionId;
      return createRulesSession(announce);
    },
    [rulesSessionId, createRulesSession]
  );

  const startCombat = useCallback(async () => {
    if (!pcId || !enemyId) return;
    setCombatBusy(true);
    try {
      await ensureRulesSession(true);
    } catch (error) {
      console.error("Failed to start combat", error);
    } finally {
      setCombatBusy(false);
    }
  }, [ensureRulesSession, pcId, enemyId]);

  const runAttack = useCallback(async () => {
    if (!rulesSessionId) return;
    setCombatBusy(true);
    try {
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${rulesSessionId}/attack`,
        { weapon_id: weaponId || undefined }
      );
      const narration =
        response.narration ||
        `${response.attacker} attacks: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, { role: "assistant", content: narration }]);
    } catch (error) {
      console.error("Attack failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId, weaponId]);

  const runEnemyTurn = useCallback(async () => {
    if (!rulesSessionId) return;
    setCombatBusy(true);
    try {
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${rulesSessionId}/enemy_turn`,
        {}
      );
      const narration =
        response.narration ||
        `${response.attacker} strikes: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, { role: "assistant", content: narration }]);
      setCheckUsed(false);
    } catch (error) {
      console.error("Enemy turn failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId]);

  const ensureSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }
    const response = await apiPost(serverUrl, "/api/sessions", {
      messages: messages.length ? messages : undefined,
    });
    setSessionId(response.session_id);
    await setJson(STORAGE_KEYS.lastSession, response.session_id);
    return response.session_id;
  }, [messages, serverUrl, sessionId]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setInput("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    try {
      const id = await ensureSession();
      const response = await apiPost(serverUrl, `/api/sessions/${id}/messages`, {
        message: trimmed,
      });
      const aiContent =
        response?.response ??
        response?.assistant ??
        response?.content ??
        response?.narration ??
        response?.message;
      if (aiContent) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: aiContent },
        ]);
      }
      if (response?.credits && onCreditsUpdate) {
        onCreditsUpdate(response.credits);
      }
    } catch (error) {
      const errorMessage =
        error?.message && error.message.length < 300
          ? error.message
          : "Stream failed. Try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, ensureSession, serverUrl, onCreditsUpdate]);

  const data = useMemo(
    () => messages.map((msg, index) => ({ id: `${index}`, ...msg })),
    [messages]
  );

  useEffect(() => {
    storyCache.messages = messages;
  }, [messages]);

  useEffect(() => {
    storyCache.sessionId = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!characterEntry) return;
    const name = characterEntry.name || "Adventurer";
    const klass = characterEntry.klass || "Hero";
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `${name} the ${klass} steps into the tale. The world listens.`,
      },
    ]);
    onCharacterEntryHandled?.();
  }, [characterEntry, onCharacterEntryHandled]);

  const checkModeButtons = useMemo(
    () => [
      { id: "skill", label: "Skill" },
      { id: "ability", label: "Ability" },
      { id: "save", label: "Save" },
    ],
    []
  );

  const buildCheckPayload = useCallback(() => {
    const payload = {};
    if (checkMode === "skill" && checkSkill) {
      payload.skill = checkSkill.toLowerCase();
    }
    if (checkMode === "ability" && checkAbility) {
      payload.ability = checkAbility.toLowerCase();
    }
    if (checkMode === "save" && checkSave) {
      payload.save = checkSave.toLowerCase();
    }
    return payload;
  }, [checkAbility, checkMode, checkSave, checkSkill]);

  const ensureCheckSession = useCallback(async () => {
    return ensureRulesSession(false);
  }, [ensureRulesSession]);

  const performCheck = useCallback(async () => {
    if (checkBusy) return;
    if (checkUsed) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Only one check per turn." },
      ]);
      return;
    }
    setCheckBusy(true);
    try {
      const id = await ensureCheckSession();
      const payload = buildCheckPayload();
      if (checkDc) {
        payload.dc = Number(checkDc) || 15;
      }
      if (checkContext) {
        payload.context = checkContext;
      }
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/skill_check`,
        payload
      );
      setCheckResult(response);
      setCheckUsed(true);
    } catch (error) {
      console.error("Check failed", error);
    } finally {
      setCheckBusy(false);
    }
  }, [
    buildCheckPayload,
    checkBusy,
    checkContext,
    checkDc,
    ensureCheckSession,
    serverUrl,
  ]);

  const suggestCheckDc = useCallback(async () => {
    if (checkBusy) return;
    setCheckBusy(true);
    try {
      const id = await ensureCheckSession();
      const payload = buildCheckPayload();
      if (checkContext) {
        payload.context = checkContext;
      }
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/dc`,
        payload
      );
      if (response?.dc) {
        setCheckDc(String(response.dc));
      }
    } catch (error) {
      console.error("DC suggestion failed", error);
    } finally {
      setCheckBusy(false);
    }
  }, [
    buildCheckPayload,
    checkBusy,
    checkContext,
    ensureCheckSession,
    serverUrl,
  ]);
  const toggleDrawer = useCallback(() => {
    setDrawerExpanded((prev) => !prev);
  }, []);

  const handleWeaponSelect = useCallback((id) => {
    setWeaponId(id);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: `Equipped ${id}.` },
    ]);
  }, []);

  const handleInitiative = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Initiative rolled." },
    ]);
  }, []);

  const handleInventory = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Inventory toggled." },
    ]);
  }, []);

  useEffect(() => {
    if (rulesSessionId) {
      setDrawerExpanded(true);
    }
  }, [rulesSessionId]);

  useEffect(() => {
    setCheckUsed(false);
  }, [rulesSessionId]);

  useEffect(() => {
    Animated.timing(drawerAnimation, {
      toValue: drawerExpanded ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [drawerAnimation, drawerExpanded]);

  const drawerSlide = drawerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [DRAWER_CONTENT_HEIGHT, 0],
    extrapolate: "clamp",
  });

  const drawerOpacity = drawerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const drawerLabel = rulesSessionId ? "Combat controls" : "Combat drawer";

  return (
    <View style={styles.root}>
      <View style={styles.chatArea}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user" ? styles.userText : styles.aiText,
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
        />
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingLabel}>The GM is thinking...</Text>
          </View>
        )}
      </View>
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe your move..."
          placeholderTextColor={colors.mutedGold}
        />
        <Button
          label={loading ? "..." : "Send"}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        />
      </View>
      <Animated.View
        style={[styles.drawer, { transform: [{ translateY: drawerSlide }] }]}
      >
        <Pressable onPress={toggleDrawer} style={styles.drawerHandle}>
          <Text style={styles.drawerHandleLabel}>{drawerLabel}</Text>
          <Text style={styles.drawerHandleBadge}>
            {rulesSessionId ? "In combat" : "Idle"}
          </Text>
        </Pressable>
        <Animated.View
          style={[
            styles.drawerContentWrapper,
            { opacity: drawerOpacity },
          ]}
          pointerEvents={drawerExpanded ? "auto" : "none"}
        >
          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectorRow}
            >
              {pcs.map((pc) => (
                <Text
                  key={pc.id}
                  style={[styles.pill, pc.id === pcId && styles.pillActive]}
                  onPress={() => {
                    setPcId(pc.id);
                    setRulesSessionId(null);
                  }}
                >
                  {pc.name}
                </Text>
              ))}
            </ScrollView>
            <View style={styles.drawerButtonRow}>
              {rulesSessionId ? (
                <Button
                  label="Attack"
                  onPress={runAttack}
                  disabled={combatBusy}
                />
              ) : (
                <Button
                  label={combatBusy ? "..." : "Start Combat"}
                  onPress={startCombat}
                  disabled={combatBusy}
                />
              )}
              <Button
                label="Enemy Turn"
                onPress={runEnemyTurn}
                disabled={combatBusy || !rulesSessionId}
                variant="ghost"
              />
              <Button
                label="Spells"
                onPress={() => onNavigate?.("spells")}
                variant="ghost"
              />
              <Button
                label="Checks"
                onPress={() => onNavigate?.("checks")}
                variant="ghost"
              />
            </View>
            <View style={styles.drawerButtonRow}>
              <Button
                label="Initiative"
                onPress={handleInitiative}
                variant="ghost"
                style={styles.halfButton}
              />
              <Button
                label="Inventory"
                onPress={handleInventory}
                variant="ghost"
                style={styles.halfButton}
              />
            </View>
            {!!weaponOptions.length && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weaponRow}
              >
                {weaponOptions.map((weapon) => (
                  <Button
                    key={weapon.id}
                    label={weapon.name}
                    onPress={() => handleWeaponSelect(weapon.id)}
                    variant={weapon.id === weaponId ? "primary" : "ghost"}
                    style={styles.weaponButton}
                  />
                ))}
              </ScrollView>
            )}
            <View style={styles.checkSection}>
              <Text style={styles.checkSectionTitle}>Rule Check</Text>
              <View style={styles.drawerButtonRow}>
                {checkModeButtons.map((modeOption) => (
                  <Text
                    key={modeOption.id}
                    style={[
                      styles.pill,
                      modeOption.id === checkMode && styles.pillActive,
                      !checkBusy && styles.checkModePill,
                    ]}
                    onPress={() => setCheckMode(modeOption.id)}
                  >
                    {modeOption.label}
                  </Text>
                ))}
              </View>
              {checkMode === "skill" ? (
                <TextInput
                  style={styles.drawerInput}
                  value={checkSkill}
                  onChangeText={setCheckSkill}
                  placeholder="Skill (e.g. stealth)"
                  placeholderTextColor={colors.mutedGold}
                />
              ) : null}
              {checkMode === "ability" ? (
                <TextInput
                  style={styles.drawerInput}
                  value={checkAbility}
                  onChangeText={setCheckAbility}
                  placeholder="Ability (str)"
                  placeholderTextColor={colors.mutedGold}
                />
              ) : null}
              {checkMode === "save" ? (
                <TextInput
                  style={styles.drawerInput}
                  value={checkSave}
                  onChangeText={setCheckSave}
                  placeholder="Saving throw (wis)"
                  placeholderTextColor={colors.mutedGold}
                />
              ) : null}
              <TextInput
                style={styles.drawerInput}
                value={checkDc}
                onChangeText={setCheckDc}
                keyboardType="numeric"
                placeholder="DC"
                placeholderTextColor={colors.mutedGold}
              />
              <TextInput
                style={styles.drawerInput}
                value={checkContext}
                onChangeText={setCheckContext}
                placeholder="Context (optional)"
                placeholderTextColor={colors.mutedGold}
              />
              <View style={styles.drawerButtonRow}>
                <Button
                  label={checkBusy ? "..." : "Suggest DC"}
                  onPress={suggestCheckDc}
                  variant="ghost"
                  disabled={checkBusy}
                />
                <Button
                  label={checkBusy ? "..." : "Roll Check"}
                  onPress={performCheck}
                  disabled={checkBusy || checkUsed}
                />
              </View>
              {checkUsed ? (
                <Text style={styles.muted}>Check used this turn.</Text>
              ) : null}
              {checkResult ? (
                <View style={styles.checkResult}>
                  <Text style={styles.checkResultText}>
                    Total: {checkResult.total ?? "-"}
                  </Text>
                  <Text style={styles.checkResultText}>
                    Success: {checkResult.success ? "yes" : "no"}
                  </Text>
                  <Text style={styles.checkResultText}>
                    Rolls: {checkResult.rolls?.join(", ") || "-"}
                  </Text>
                </View>
              ) : (
                <Text style={styles.muted}>No recent check.</Text>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingTop: spacing.lg,
    paddingHorizontal: 0,
    paddingBottom: DRAWER_COLLAPSED_HEIGHT + spacing.lg,
    width: "100%",
    position: "relative",
  },
  chatArea: {
    flex: 1,
    minHeight: 360,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    width: "100%",
    position: "relative",
    zIndex: 1,
  },
  inputArea: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.panelAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    width: "100%",
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    justifyContent: "flex-start",
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.panel,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: 14,
  },
  userText: {
    color: colors.ink,
  },
  aiText: {
    color: colors.parchment,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.parchment,
    backgroundColor: colors.panel,
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    overflow: "hidden",
    height: DRAWER_COLLAPSED_HEIGHT + DRAWER_CONTENT_HEIGHT,
    zIndex: 2,
    minHeight: DRAWER_COLLAPSED_HEIGHT,
  },
  drawerHandle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    height: DRAWER_COLLAPSED_HEIGHT,
  },
  drawerHandleLabel: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  drawerHandleBadge: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  drawerContentWrapper: {
    flex: 1,
  },
  drawerScroll: {
    maxHeight: DRAWER_CONTENT_HEIGHT,
    width: "100%",
  },
  drawerScrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  selectorRow: {
    gap: spacing.sm,
  },
  pill: {
    color: colors.mutedGold,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pillActive: {
    backgroundColor: colors.gold,
    color: colors.ink,
    borderColor: colors.gold,
  },
  drawerButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  weaponRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  weaponButton: {
    flex: 1,
    minWidth: 120,
  },
  halfButton: {
    flex: 1,
  },
  checkSection: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.sm,
  },
  checkSectionTitle: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  drawerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.parchment,
    backgroundColor: colors.panelAlt,
  },
  checkModePill: {
    borderColor: colors.gold,
  },
  checkResult: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.panelAlt,
  },
  checkResultText: {
    color: colors.parchment,
    fontSize: 12,
  },
  muted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.md,
    zIndex: 10,
    pointerEvents: "none",
  },
  loadingLabel: {
    color: colors.parchment,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
});
