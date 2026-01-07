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
const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
const LOADING_FLAVOR = [
  "polishing toadstools",
  "gathering gnomes",
  "sharpening swords",
  "brewing storm tea",
  "charting cavern echoes",
  "folding secret maps",
  "counting torchwick",
  "whispering to ravens",
];
const INTRO_FALLBACKS = [
  "A lantern sputters beside a mossy stairwell that drops into a ruin no map admits. Damp air tastes of iron and old incense, and something below answers your footstep with a slow, waiting scrape. Your hand closes around a cracked stone charm that hums with a warning. Do you descend or search the threshold for a safer way in?",
  "Stormlight flashes over a ridge of broken pillars as the earth rumbles beneath your boots. A hidden door has opened in the hillside, exhaling warm breath and the faint scent of spice and ash. Somewhere inside, a bell rings once, then stops. What do you do?",
  "A low chant rises from the valley, and the torches along the old road flare as you approach. The shrine ahead is half-collapsed, its altar split, yet fresh footprints circle the entrance. Your pack shifts as if something inside wants out. Will you enter, scout, or call out?",
];

function pickIntro() {
  const index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

function pickFallbackIntro() {
  const index = Math.floor(Math.random() * INTRO_FALLBACKS.length);
  return INTRO_FALLBACKS[index] || INTRO_FALLBACKS[0];
}

function looksLikePrompt(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("write an opening scene") ||
    lower.includes("create a new opening scene") ||
    lower.includes("you are a fantasy narrator") ||
    lower.includes("avoid clich") ||
    lower.includes("opening scene (")
  );
}

function sanitizeIntro(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length < 80) return null;
  if (looksLikePrompt(trimmed)) return null;
  return trimmed;
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
  const [pcCatalog, setPcCatalog] = useState({});
  const [pcId, setPcId] = useState(null);
  const [enemyId, setEnemyId] = useState(null);
  const [rulesSessionId, setRulesSessionId] = useState(null);
  const [weaponId, setWeaponId] = useState(null);
  const [weaponOptions, setWeaponOptions] = useState([]);
  const [combatBusy, setCombatBusy] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const drawerAnimation = useRef(new Animated.Value(0)).current;
  const [checkMode, setCheckMode] = useState("skill");
  const [checkResult, setCheckResult] = useState(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkUsed, setCheckUsed] = useState(false);
  const [rulesSeeded, setRulesSeeded] = useState(false);
  const [adventureLoading, setAdventureLoading] = useState(false);
  const [loadingFlavorIndex, setLoadingFlavorIndex] = useState(0);
  const shouldNarrate = useCallback(() => Math.random() < 0.5, []);
  const selectedPc = useMemo(() => pcCatalog[pcId] || null, [pcCatalog, pcId]);
  const skillOptions = useMemo(
    () => selectedPc?.skill_proficiencies || [],
    [selectedPc]
  );
  const saveOptions = useMemo(
    () => selectedPc?.save_proficiencies || [],
    [selectedPc]
  );
  const abilityOptions = useMemo(() => {
    const stats = selectedPc?.stats || {};
    const found = ABILITY_ORDER.filter((key) => stats[key] != null);
    return found.length ? found : ABILITY_ORDER;
  }, [selectedPc]);

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

  const fetchAiIntro = useCallback(
    async (name, klass) => {
      try {
        const payload = {};
        if (name) payload.name = name;
        if (klass) payload.klass = klass;
        const response = await Promise.race([
          apiPost(serverUrl, "/api/intro", payload),
          new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        return response?.intro || null;
      } catch (error) {
        return null;
      }
    },
    [serverUrl]
  );

  const generateIntroViaChat = useCallback(
    async (name, klass) => {
      try {
        const id = await ensureSession();
        const identity = name && klass ? `${name} the ${klass}` : name || klass || "the hero";
        const message = [
          `Start a vivid opening scene in 2-4 sentences for ${identity}.`,
          "Make it specific, atmospheric, and end with a direct question.",
          "Avoid tavern starts and keep it punchy for mobile.",
        ].join(" ");
        const response = await apiPost(serverUrl, `/api/sessions/${id}/messages`, { message });
        return (
          response?.response ??
          response?.assistant ??
          response?.content ??
          response?.narration ??
          response?.message ??
          null
        );
      } catch (error) {
        return null;
      }
    },
    [ensureSession, serverUrl]
  );

  const getIntro = useCallback(
    async (name, klass) => {
      const apiIntro = sanitizeIntro(await fetchAiIntro(name, klass));
      if (apiIntro) return apiIntro;
      const chatIntro = sanitizeIntro(await generateIntroViaChat(name, klass));
      if (chatIntro) return chatIntro;
      return pickFallbackIntro() || pickIntro();
    },
    [fetchAiIntro, generateIntroViaChat]
  );

  const loadSession = useCallback(async () => {
    const storedId = await getJson(STORAGE_KEYS.lastSession, null);
    if (storedId) {
      setSessionId(storedId);
      setAdventureLoading(false);
      return;
    }
    setAdventureLoading(true);
    const intro = await getIntro();
    setTimeout(() => {
      setMessages([{ role: "assistant", content: intro }]);
      setRulesSeeded(true);
      setAdventureLoading(false);
    }, 900);
  }, [getIntro]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!rulesSeeded && messages.length) {
      setRulesSeeded(true);
    }
  }, [messages, rulesSeeded]);

  useEffect(() => {
    if (!adventureLoading) return;
    const interval = setInterval(() => {
      setLoadingFlavorIndex((prev) => (prev + 1) % LOADING_FLAVOR.length);
    }, 900);
    return () => clearInterval(interval);
  }, [adventureLoading]);

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
      setPcCatalog(premadeSource || {});
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
      const narrate = shouldNarrate();
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${rulesSessionId}/attack${narrate ? "?narrate=true" : ""}`,
        { weapon_id: weaponId || undefined }
      );
      const summary = `${response.attacker} attacks: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
      if (response?.narration) {
        setMessages((prev) => [...prev, { role: "assistant", content: response.narration }]);
      }
    } catch (error) {
      console.error("Attack failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId, weaponId, shouldNarrate]);

  const runEnemyTurn = useCallback(async () => {
    if (!rulesSessionId) return;
    setCombatBusy(true);
    try {
      const narrate = shouldNarrate();
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${rulesSessionId}/enemy_turn${narrate ? "?narrate=true" : ""}`,
        {}
      );
      const summary = `${response.attacker} strikes: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
      if (response?.narration) {
        setMessages((prev) => [...prev, { role: "assistant", content: response.narration }]);
      }
      setCheckUsed(false);
    } catch (error) {
      console.error("Enemy turn failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId, shouldNarrate]);

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
    setAdventureLoading(true);
    let isActive = true;
    getIntro(name, klass).then((intro) => {
      if (!isActive) return;
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: intro,
          },
        ]);
        setAdventureLoading(false);
        onCharacterEntryHandled?.();
      }, 900);
    });
    return () => {
      isActive = false;
    };
  }, [characterEntry, onCharacterEntryHandled, getIntro]);

  const checkModeButtons = useMemo(
    () => [
      { id: "skill", label: "Skill" },
      { id: "ability", label: "Ability" },
      { id: "save", label: "Save" },
    ],
    []
  );

  const ensureCheckSession = useCallback(async () => {
    return ensureRulesSession(false);
  }, [ensureRulesSession]);

  const buildCheckContext = useCallback(() => {
    const recent = messages.slice(-2).map((msg) => msg.content).join(" ");
    return recent || "Combat check.";
  }, [messages]);

  const runCheck = useCallback(async (payload, label) => {
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
      const context = buildCheckContext();
      const dcResponse = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/dc`,
        { ...payload, context }
      );
      const dc = Number(dcResponse?.dc) || 15;
      const narrate = shouldNarrate();
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/skill_check${narrate ? "?narrate=true" : ""}`,
        { ...payload, dc }
      );
      setCheckResult(response);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${label} = ${response?.total ?? "-"}` },
      ]);
      if (response?.narration) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.narration },
        ]);
      }
      setCheckUsed(true);
    } catch (error) {
      console.error("Check failed", error);
    } finally {
      setCheckBusy(false);
    }
  }, [
    buildCheckContext,
    checkBusy,
    checkUsed,
    ensureCheckSession,
    serverUrl,
    shouldNarrate,
  ]);

  const handleSkillCheck = useCallback(
    (skill) => {
      runCheck({ skill: skill.toLowerCase() }, `${skill} check`);
    },
    [runCheck]
  );

  const handleAbilityCheck = useCallback(
    (ability) => {
      runCheck({ ability }, `${ability.toUpperCase()} check`);
    },
    [runCheck]
  );

  const handleSaveCheck = useCallback(
    (ability) => {
      runCheck({ save: ability }, `${ability.toUpperCase()} save`);
    },
    [runCheck]
  );
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
        {loading && !adventureLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingLabel}>The GM is thinking...</Text>
          </View>
        )}
        {adventureLoading && !loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingLabel}>
              Loading adventure: {LOADING_FLAVOR[loadingFlavorIndex]}
            </Text>
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
                skillOptions.length ? (
                  <View style={styles.drawerButtonRow}>
                    {skillOptions.map((skill) => {
                      const label = skill
                        .split(" ")
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                        .join(" ");
                      return (
                        <Button
                          key={skill}
                          label={label}
                          onPress={() => handleSkillCheck(skill)}
                          disabled={checkBusy || checkUsed}
                          variant="ghost"
                        />
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.muted}>No skills available.</Text>
                )
              ) : null}
              {checkMode === "ability" ? (
                <View style={styles.drawerButtonRow}>
                  {abilityOptions.map((ability) => (
                    <Button
                      key={ability}
                      label={ability.toUpperCase()}
                      onPress={() => handleAbilityCheck(ability)}
                      disabled={checkBusy || checkUsed}
                      variant="ghost"
                    />
                  ))}
                </View>
              ) : null}
              {checkMode === "save" ? (
                saveOptions.length ? (
                  <View style={styles.drawerButtonRow}>
                    {saveOptions.map((ability) => (
                      <Button
                        key={ability}
                        label={`${ability.toUpperCase()} Save`}
                        onPress={() => handleSaveCheck(ability)}
                        disabled={checkBusy || checkUsed}
                        variant="ghost"
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>No saves available.</Text>
                )
              ) : null}
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
