import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet, apiPost } from "../api/client";
import { colors, radius, spacing } from "../theme";

const CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

const WEAPONS = [
  { id: "shortsword", name: "Shortsword", damage: "1d6+0", damage_type: "piercing", attack_ability: "dex", finesse: true },
  { id: "longsword", name: "Longsword", damage: "1d8+0", damage_type: "slashing", attack_ability: "str", finesse: false },
  { id: "rapier", name: "Rapier", damage: "1d8+0", damage_type: "piercing", attack_ability: "dex", finesse: true },
  { id: "shortbow", name: "Shortbow", damage: "1d6+0", damage_type: "piercing", attack_ability: "dex", finesse: false },
];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function abilityMod(score) {
  return Math.floor((score - 10) / 2);
}

export default function CharacterScreen({ serverUrl }) {
  const [characters, setCharacters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState("custom");
  const [busy, setBusy] = useState(false);

  const loadCharacters = useCallback(async () => {
    try {
      const [premades, custom] = await Promise.all([
        apiGet(serverUrl, "/api/rules/premades"),
        apiGet(serverUrl, "/api/characters"),
      ]);
      const premadeList = Object.entries(premades || {}).map(([id, payload]) => ({
        id,
        type: "premade",
        name: payload.name,
        klass: payload.class,
        level: payload.level,
      }));
      const customList = Object.entries(custom || {}).map(([id, payload]) => ({
        id,
        type: "custom",
        name: payload.name,
        klass: payload.class,
        level: payload.level,
      }));
      const all = [...customList, ...premadeList];
      setCharacters(all);
      if (!selectedId && all[0]) {
        setSelectedId(all[0].id);
        setSelectedType(all[0].type);
      }
    } catch (error) {
      console.error("Failed to load characters", error);
    }
  }, [serverUrl, selectedId]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId),
    [characters, selectedId]
  );

  const createRandomCharacter = useCallback(async () => {
    setBusy(true);
    try {
      const stats = shuffle([15, 14, 13, 12, 10, 8]);
      const klass = CLASSES[Math.floor(Math.random() * CLASSES.length)];
      const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      const payload = {
        name: `Adventurer ${Math.floor(Math.random() * 999)}`,
        klass,
        level: 1,
        stats: {
          str: stats[0],
          dex: stats[1],
          con: stats[2],
          int: stats[3],
          wis: stats[4],
          cha: stats[5],
        },
        armor_class: 10 + abilityMod(stats[1]),
        max_hp: 8 + abilityMod(stats[2]),
        weapons: [weapon],
        items: [],
      };
      await apiPost(serverUrl, "/api/characters", payload);
      await loadCharacters();
    } catch (error) {
      console.error("Failed to create character", error);
    } finally {
      setBusy(false);
    }
  }, [serverUrl, loadCharacters]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Characters">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {characters.map((character) => (
              <Text
                key={character.id}
                style={[
                  styles.pill,
                  character.id === selectedId && styles.pillActive,
                ]}
                onPress={() => {
                  setSelectedId(character.id);
                  setSelectedType(character.type);
                }}
              >
                {character.name}
              </Text>
            ))}
          </View>
        </ScrollView>
        <Button
          label={busy ? "..." : "Create Random"}
          onPress={createRandomCharacter}
          disabled={busy}
        />
      </Section>

      <Section title="Sheet">
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.meta}>
              {selected.klass} · Level {selected.level} · {selectedType}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>No character selected.</Text>
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
  },
  muted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
});
