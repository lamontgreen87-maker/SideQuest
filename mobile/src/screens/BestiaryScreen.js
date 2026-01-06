import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet } from "../api/client";
import { colors, radius, spacing } from "../theme";

function formatKey(key) {
  return key.replace(/_/g, " ");
}

export default function BestiaryScreen({ serverUrl }) {
  const [monsters, setMonsters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const loadBestiary = useCallback(async () => {
    try {
      const data = await apiGet(serverUrl, "/api/bestiary");
      const list = Object.entries(data || {}).map(([id, payload]) => ({
        id,
        ...payload,
      }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMonsters(list);
      if (!selectedId && list[0]) {
        setSelectedId(list[0].id);
      }
    } catch (error) {
      console.error("Failed to load bestiary", error);
    }
  }, [serverUrl, selectedId]);

  useEffect(() => {
    loadBestiary();
  }, [loadBestiary]);

  const selected = useMemo(
    () => monsters.find((monster) => monster.id === selectedId),
    [monsters, selectedId]
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Bestiary">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {monsters.map((monster) => (
              <Text
                key={monster.id}
                style={[
                  styles.pill,
                  monster.id === selectedId && styles.pillActive,
                ]}
                onPress={() => setSelectedId(monster.id)}
              >
                {monster.name}
              </Text>
            ))}
          </View>
        </ScrollView>
      </Section>

      <Section title="Monster Sheet">
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.meta}>Source: {selected.source || "core"}</Text>
            <View style={styles.stats}>
              <Text style={styles.stat}>AC: {selected.armor_class}</Text>
              <Text style={styles.stat}>HP: {selected.max_hp}</Text>
              <Text style={styles.stat}>Attack Bonus: {selected.attack_bonus}</Text>
            </View>
            <Text style={styles.stat}>Damage: {selected.damage}</Text>
            <Text style={styles.stat}>Type: {selected.damage_type}</Text>
            {selected.desc ? (
              <Text style={styles.desc}>{selected.desc}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.muted}>No monster selected.</Text>
        )}
        <Button label="Refresh" onPress={loadBestiary} variant="ghost" />
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
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  name: {
    color: colors.parchment,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  meta: {
    color: colors.mutedGold,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  stat: {
    color: colors.parchment,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  desc: {
    color: colors.mutedGold,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  muted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
