import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../components/Button";
import { apiGet, apiPost } from "../api/client";
import { INTRO_PROMPTS, STORAGE_KEYS } from "../config";
import { getJson, setItem, setJson } from "../storage";
import { colors, radius, spacing } from "../theme";

function pickIntro() {
  const index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

export default function StoryScreen({ serverUrl, onCreditsUpdate, onNavigate }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [pcs, setPcs] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [pcId, setPcId] = useState(null);
  const [enemyId, setEnemyId] = useState(null);
  const [rulesSessionId, setRulesSessionId] = useState(null);
  const [weaponId, setWeaponId] = useState(null);
  const [combatBusy, setCombatBusy] = useState(false);

  const loadSession = useCallback(async () => {
    const storedId = await getJson(STORAGE_KEYS.lastSession, null);
    if (storedId) {
      setSessionId(storedId);
      return;
    }
    const intro = pickIntro();
    setMessages([{ role: "assistant", content: intro }]);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const loadCombatCatalogs = useCallback(async () => {
    try {
      const [premades, bestiary] = await Promise.all([
        apiGet(serverUrl, "/api/rules/premades"),
        apiGet(serverUrl, "/api/bestiary"),
      ]);
      const pcList = Object.entries(premades || {}).map(([id, payload]) => ({
        id,
        name: payload.name,
      }));
      const enemyList = Object.entries(bestiary || {}).map(([id, payload]) => ({
        id,
        name: payload.name,
      }));
      setPcs(pcList);
      setEnemies(enemyList);
      if (!pcId && pcList[0]) setPcId(pcList[0].id);
      if (!enemyId && enemyList[0]) setEnemyId(enemyList[0].id);
    } catch (error) {
      console.error("Failed to load combat catalogs", error);
    }
  }, [serverUrl, pcId, enemyId]);

  useEffect(() => {
    loadCombatCatalogs();
  }, [loadCombatCatalogs]);

  const startCombat = useCallback(async () => {
    if (!pcId || !enemyId) return;
    setCombatBusy(true);
    try {
      const response = await apiPost(serverUrl, "/api/rules/sessions", {
        pc_id: pcId,
        enemy_id: enemyId,
      });
      setRulesSessionId(response.session_id);
      const weaponKeys = response?.pc?.weapons
        ? Object.keys(response.pc.weapons)
        : [];
      setWeaponId(weaponKeys[0] || null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Combat starts: ${response.pc?.name} vs ${response.enemy?.name}.`,
        },
      ]);
    } catch (error) {
      console.error("Failed to start combat", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, pcId, enemyId]);

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
        fast: fastMode,
      });
      if (response?.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.response },
        ]);
      }
      if (response?.credits && onCreditsUpdate) {
        onCreditsUpdate(response.credits);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Stream failed. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, ensureSession, serverUrl, fastMode, onCreditsUpdate]);

  const data = useMemo(
    () => messages.map((msg, index) => ({ id: `${index}`, ...msg })),
    [messages]
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button
          label={fastMode ? "Fast On" : "Fast Off"}
          variant="ghost"
          onPress={() => setFastMode((prev) => !prev)}
        />
      </View>
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
        contentContainerStyle={styles.list}
      />
      <View style={styles.combatPanel}>
        <View style={styles.row}>
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
        </View>
        <View style={styles.row}>
          {enemies.map((enemy) => (
            <Text
              key={enemy.id}
              style={[styles.pill, enemy.id === enemyId && styles.pillActive]}
              onPress={() => {
                setEnemyId(enemy.id);
                setRulesSessionId(null);
              }}
            >
              {enemy.name}
            </Text>
          ))}
        </View>
        <View style={styles.row}>
          {!rulesSessionId ? (
            <Button
              label={combatBusy ? "..." : "Start Combat"}
              onPress={startCombat}
              disabled={combatBusy}
            />
          ) : (
            <>
              <Button
                label="Attack"
                onPress={runAttack}
                disabled={combatBusy}
              />
              <Button
                label="Enemy Turn"
                onPress={runEnemyTurn}
                disabled={combatBusy}
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
            </>
          )}
        </View>
      </View>
      <View style={styles.inputRow}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.sm,
  },
  list: {
    paddingBottom: spacing.lg,
    gap: spacing.sm,
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
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  combatPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
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
});
