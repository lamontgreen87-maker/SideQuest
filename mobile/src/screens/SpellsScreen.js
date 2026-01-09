import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet } from "../api/client";
import { colors, radius, spacing } from "../theme";
import { DEFAULT_SPELLS } from "../data/dnd";

function formatList(value) {
  if (value === undefined || value === null) return "-";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}


function normalizeSpellClasses(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export default function SpellsScreen({ serverUrl, characterClass }) {
  const [spells, setSpells] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const loadSpells = useCallback(async () => {
    try {
      const data = await apiGet(serverUrl, "/api/rules/spells");
      const fallbackSource =
        data && Object.keys(data).length
          ? data
          : DEFAULT_SPELLS.reduce((acc, entry) => {
              acc[entry.id] = entry;
              return acc;
            }, {});
      const list = Object.entries(fallbackSource).map(([id, payload]) => ({
        id,
        ...payload,
        classes: normalizeSpellClasses(payload.classes),
      }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSpells(list);
      if (!selectedId && list[0]) {
        setSelectedId(list[0].id);
      }
    } catch (error) {
      console.error("Failed to load spells", error);
    }
  }, [serverUrl, selectedId]);

  const classFiltered = useMemo(() => {
    if (!characterClass) return spells;
    const target = String(characterClass).toLowerCase().trim();
    if (!target) return spells;
    const matches = spells.filter((spell) =>
      spell.classes?.some((cls) => {
        const normalized = String(cls).toLowerCase().trim();
        return normalized === target || normalized.includes(target) || target.includes(normalized);
      })
    );
    return matches.length ? matches : spells;
  }, [spells, characterClass]);

  useEffect(() => {
    if (!classFiltered.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !classFiltered.some((spell) => spell.id === selectedId)) {
      setSelectedId(classFiltered[0].id);
    }
  }, [classFiltered, selectedId]);

  useEffect(() => {
    loadSpells();
  }, [loadSpells]);

  const selected = useMemo(
    () => classFiltered.find((spell) => spell.id === selectedId),
    [classFiltered, selectedId]
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content]}>
      <Section title="Spells">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {classFiltered.map((spell) => (
              <Text
                key={spell.id}
                style={[styles.pill, spell.id === selectedId && styles.pillActive]}
                onPress={() => setSelectedId(spell.id)}
              >
                {spell.name}
              </Text>
            ))}
          </View>
        </ScrollView>
      </Section>

      <Section title="Spell Sheet">
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.meta}>
              Level {formatList(selected.level)} · {formatList(selected.school)}
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Casting</Text>
              <Text style={styles.statValue}>{formatList(selected.casting_time)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Range</Text>
              <Text style={styles.statValue}>{formatList(selected.range)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Duration</Text>
              <Text style={styles.statValue}>{formatList(selected.duration)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Components</Text>
              <Text style={styles.statValue}>{formatList(selected.components)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>Classes</Text>
              <Text style={styles.statValue}>{formatList(selected.classes)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.statLabel}>School</Text>
              <Text style={styles.statValue}>{formatList(selected.school)}</Text>
            </View>
            {selected.desc ? (
              <Text style={styles.desc}>{selected.desc.join("\n\n")}</Text>
            ) : null}
            {selected.higher_level ? (
              <Text style={styles.desc}>
                Higher Level: {selected.higher_level.join("\n\n")}
              </Text>
            ) : null}
            {selected.ritual ? (
              <Text style={styles.desc}>Ritual: {selected.ritual ? "Yes" : "No"}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.muted}>
            {characterClass
              ? `No spells available for ${characterClass}.`
              : "No spell selected."}
          </Text>
        )}
        <Button label="Refresh" onPress={loadSpells} variant="ghost" />
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
  infoRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginBottom: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
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
