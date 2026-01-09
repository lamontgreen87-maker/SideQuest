import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet } from "../api/client";
import { colors, radius, spacing } from "../theme";
import { DEFAULT_BESTIARY } from "../data/dnd";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

const ABILITY_LABELS = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function formatList(value) {
  if (value === undefined || value === null) return "-";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}


export default function BestiaryScreen({ serverUrl }) {
  const [monsters, setMonsters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");

  const loadBestiary = useCallback(async () => {
    try {
      const data = await apiGet(serverUrl, "/api/bestiary");
      const fallback =
        data ||
        DEFAULT_BESTIARY.reduce((acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        }, {});
      const list = Object.entries(fallback).map(([id, payload]) => ({
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

  const filteredMonsters = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return monsters;
    return monsters.filter((monster) =>
      String(monster.name || "").toLowerCase().includes(trimmed)
    );
  }, [monsters, query]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content]}>
      <Section title="Bestiary">
        <TextInput
          placeholder="Search monsters..."
          placeholderTextColor={colors.mutedGold}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {filteredMonsters.map((monster) => (
            <Text
              key={monster.id}
              style={[styles.listItem, monster.id === selectedId && styles.listItemActive]}
              onPress={() => setSelectedId(monster.id)}
            >
              {monster.name}
            </Text>
          ))}
          {!filteredMonsters.length ? (
            <Text style={styles.muted}>No matches.</Text>
          ) : null}
        </ScrollView>
      </Section>

      <Section title="Monster Sheet">
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.meta}>
              {selected.size || "Medium"} · {selected.type || "Creature"} ·{" "}
              {selected.alignment || "Unaligned"}
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Armor Class</Text>
              <Text style={styles.statValue}>{formatList(selected.armor_class)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Hit Points</Text>
              <Text style={styles.statValue}>{formatList(selected.max_hp)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Speed</Text>
              <Text style={styles.statValue}>{formatList(selected.speed)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Challenge</Text>
              <Text style={styles.statValue}>{formatList(selected.challenge)}</Text>
            </View>
            <View style={styles.abilityGrid}>
              {ABILITIES.map((key) => (
                <View key={key} style={styles.abilityBlock}>
                  <Text style={styles.abilityLabel}>{ABILITY_LABELS[key]}</Text>
                  <Text style={styles.abilityScore}>
                    {formatList(selected.stats?.[key])}
                  </Text>
                </View>
              ))}
            </View>
            {selected.actions?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions</Text>
                {selected.actions.map((action) => (
                  <View key={action.name} style={styles.entry}>
                    <Text style={styles.entryTitle}>{action.name}</Text>
                    <Text style={styles.entryDesc}>{formatList(action.desc)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {selected.traits?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Traits</Text>
                {selected.traits.map((trait) => (
                  <View key={trait.name} style={styles.entry}>
                    <Text style={styles.entryTitle}>{trait.name}</Text>
                    <Text style={styles.entryDesc}>{formatList(trait.desc)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {selected.legendary_actions?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Legendary Actions</Text>
                {selected.legendary_actions.map((action) => (
                  <View key={action.name} style={styles.entry}>
                    <Text style={styles.entryTitle}>{action.name}</Text>
                    <Text style={styles.entryDesc}>{formatList(action.desc)}</Text>
                  </View>
                ))}
              </View>
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
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    color: colors.parchment,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  list: {
    maxHeight: 260,
  },
  listItem: {
    color: colors.mutedGold,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  listItemActive: {
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
    gap: spacing.sm,
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
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  statLabel: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: {
    color: colors.parchment,
    fontSize: 12,
    fontWeight: "600",
  },
  abilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  abilityBlock: {
    width: "32%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.xs,
    alignItems: "center",
  },
  abilityLabel: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  abilityScore: {
    color: colors.parchment,
    fontSize: 16,
    fontWeight: "700",
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.mutedGold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  entry: {
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panelAlt,
  },
  entryTitle: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  entryDesc: {
    color: colors.parchment,
    fontSize: 12,
    marginTop: spacing.xs,
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
