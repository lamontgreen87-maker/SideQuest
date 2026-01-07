import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet, apiPost } from "../api/client";
import { colors, radius, spacing } from "../theme";
import { DEFAULT_ENEMIES, DEFAULT_PREMADES } from "../data/dnd";

export default function ChecksScreen({ serverUrl }) {
  const [pcs, setPcs] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [pcId, setPcId] = useState(null);
  const [enemyId, setEnemyId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [mode, setMode] = useState("skill");
  const [skill, setSkill] = useState("");
  const [ability, setAbility] = useState("");
  const [save, setSave] = useState("");
  const [dc, setDc] = useState("15");
  const [context, setContext] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const shouldNarrate = useCallback(() => Math.random() < 0.5, []);
  const [lastCheckLabel, setLastCheckLabel] = useState("");

  const loadCatalogs = useCallback(async () => {
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
        klass: payload.class ?? payload.klass,
        level: payload.level,
      }));
      const enemyList = Object.entries(bestiarySource).map(([id, payload]) => ({
        id,
        name: payload.name,
        source: payload.source,
      }));
      setPcs(pcList);
      setEnemies(enemyList);
      if (!pcId && pcList[0]) {
        setPcId(pcList[0].id);
      }
      if (!enemyId && enemyList[0]) {
        setEnemyId(enemyList[0].id);
      }
    } catch (error) {
      console.error("Failed to load catalogs", error);
    }
  }, [serverUrl, pcId, enemyId]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    if (!pcId || !enemyId) {
      throw new Error("Select a character and enemy first.");
    }
    const response = await apiPost(serverUrl, "/api/rules/sessions", {
      pc_id: pcId,
      enemy_id: enemyId,
    });
    setSessionId(response.session_id);
    return response.session_id;
  }, [sessionId, serverUrl, pcId, enemyId]);

  const buildPayload = useCallback(() => {
    const payload = { dc: Number(dc) || 15 };
    if (mode === "skill" && skill) payload.skill = skill.toLowerCase();
    if (mode === "ability" && ability) payload.ability = ability.toLowerCase();
    if (mode === "save" && save) payload.save = save.toLowerCase();
    return payload;
  }, [mode, skill, ability, save, dc]);

  const buildCheckLabel = useCallback(() => {
    if (mode === "skill" && skill) return `${skill} check`;
    if (mode === "ability" && ability) return `${ability} check`;
    if (mode === "save" && save) return `${save} save`;
    return "Check";
  }, [mode, skill, ability, save]);

  const suggestDc = useCallback(async () => {
    setBusy(true);
    try {
      const id = await ensureSession();
      const payload = {};
      if (mode === "skill" && skill) payload.skill = skill.toLowerCase();
      if (mode === "ability" && ability) payload.ability = ability.toLowerCase();
      if (mode === "save" && save) payload.save = save.toLowerCase();
      if (context) payload.context = context;
      const response = await apiPost(serverUrl, `/api/rules/sessions/${id}/dc`, payload);
      if (response?.dc) {
        setDc(String(response.dc));
      }
    } catch (error) {
      console.error("Failed to set DC", error);
    } finally {
      setBusy(false);
    }
  }, [ensureSession, mode, skill, ability, save, context, serverUrl]);

  const rollCheck = useCallback(async () => {
    setBusy(true);
    try {
      const id = await ensureSession();
      const payload = buildPayload();
      const narrate = shouldNarrate();
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/skill_check${narrate ? "?narrate=true" : ""}`,
        payload
      );
      setResult(response);
      setLastCheckLabel(buildCheckLabel());
    } catch (error) {
      console.error("Check failed", error);
    } finally {
      setBusy(false);
    }
  }, [ensureSession, buildPayload, serverUrl, shouldNarrate, buildCheckLabel]);

  const modeButtons = useMemo(
    () => [
      { id: "skill", label: "Skill" },
      { id: "ability", label: "Ability" },
      { id: "save", label: "Save" },
    ],
    []
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Check Type">
        <View style={styles.row}>
          {modeButtons.map((option) => (
            <Text
              key={option.id}
              style={[styles.pill, option.id === mode && styles.pillActive]}
              onPress={() => setMode(option.id)}
            >
              {option.label}
            </Text>
          ))}
        </View>
        {mode === "skill" ? (
          <TextInput
            style={styles.input}
            value={skill}
            onChangeText={setSkill}
            placeholder="Skill (athletics, stealth...)"
            placeholderTextColor={colors.mutedGold}
          />
        ) : null}
        {mode === "ability" ? (
          <TextInput
            style={styles.input}
            value={ability}
            onChangeText={setAbility}
            placeholder="Ability (str, dex, con...)"
            placeholderTextColor={colors.mutedGold}
          />
        ) : null}
        {mode === "save" ? (
          <TextInput
            style={styles.input}
            value={save}
            onChangeText={setSave}
            placeholder="Save (str, dex, con...)"
            placeholderTextColor={colors.mutedGold}
          />
        ) : null}
      </Section>

      <Section title="Difficulty Class">
        <TextInput
          style={styles.input}
          value={dc}
          onChangeText={setDc}
          keyboardType="numeric"
          placeholder="DC"
          placeholderTextColor={colors.mutedGold}
        />
        <TextInput
          style={styles.input}
          value={context}
          onChangeText={setContext}
          placeholder="Situation for AI (optional)"
          placeholderTextColor={colors.mutedGold}
        />
        <View style={styles.row}>
          <Button
            label={busy ? "..." : "Suggest DC"}
            onPress={suggestDc}
            variant="ghost"
          />
          <Button label="Roll Check" onPress={rollCheck} disabled={busy} />
        </View>
      </Section>

      <Section title="Result">
        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultText}>
              {lastCheckLabel || "Check"} = {result.total ?? "-"}
            </Text>
            <Text style={styles.resultText}>
              Total: {result.total} (Rolls: {result.rolls?.join(", ") || "-"})
            </Text>
            <Text style={styles.resultText}>
              Success: {result.success ? "Yes" : "No"}
            </Text>
            {result.narration ? (
              <Text style={styles.resultText}>{result.narration}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.muted}>No check yet.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.parchment,
    backgroundColor: colors.panel,
    marginBottom: spacing.sm,
  },
  resultCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  resultText: {
    color: colors.parchment,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  muted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
