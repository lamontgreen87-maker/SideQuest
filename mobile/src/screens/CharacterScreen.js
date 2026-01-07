import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet, apiPost } from "../api/client";
import { colors, radius, spacing } from "../theme";
import { DEFAULT_SPELLS, DND_WEAPONS } from "../data/dnd";

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

const RACES = [
  "Human",
  "Elf",
  "Dwarf",
  "Halfling",
  "Dragonborn",
  "Gnome",
  "Half-Orc",
  "Half-Elf",
  "Tiefling",
];

const BACKGROUNDS = [
  "Acolyte",
  "Criminal",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Soldier",
];

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

const SKILLS = [
  "acrobatics",
  "animal handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight of hand",
  "stealth",
  "survival",
];

const DEFAULT_STATS = {
  str: "16",
  dex: "14",
  con: "14",
  int: "12",
  wis: "10",
  cha: "8",
};

const WEAPONS = DND_WEAPONS;

const parseList = (value) =>
  (value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatValue = (value) => {
  if (value === undefined || value === null) return "-";
  return String(value);
};

const formatModifier = (mod) => (mod >= 0 ? `+${mod}` : `${mod}`);

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

export default function CharacterScreen({ serverUrl, onCharacterCreated }) {
  const [characters, setCharacters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLevel, setFormLevel] = useState("1");
  const [formClass, setFormClass] = useState(CLASSES[0]);
  const [formRace, setFormRace] = useState(RACES[0]);
  const [formBackground, setFormBackground] = useState(BACKGROUNDS[0]);
  const [formAlignment, setFormAlignment] = useState(ALIGNMENTS[0]);
  const [formStats, setFormStats] = useState(() => ({ ...DEFAULT_STATS }));
  const [formArmorClass, setFormArmorClass] = useState("10");
  const [formMaxHp, setFormMaxHp] = useState("10");
  const [formSpellcastingAbility, setFormSpellcastingAbility] = useState("wis");
  const [selectedCantrips, setSelectedCantrips] = useState([]);
  const [selectedSpells, setSelectedSpells] = useState([]);
  const [formItems, setFormItems] = useState("");
  const [formTraits, setFormTraits] = useState("");
  const [formLanguages, setFormLanguages] = useState("");
  const [formSaveProficiencies, setFormSaveProficiencies] = useState([]);
  const [formSkillProficiencies, setFormSkillProficiencies] = useState([]);
  const [selectedWeapons, setSelectedWeapons] = useState([WEAPONS[0].id]);
  const [spellCatalog, setSpellCatalog] = useState([]);

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
  const loadSpells = useCallback(async () => {
    try {
      const data = await apiGet(serverUrl, "/api/rules/spells");
      const fallback =
        DEFAULT_SPELLS.reduce((acc, spell) => {
          acc[spell.id] = spell;
          return acc;
        }, {});
      const source = {
        ...fallback,
        ...(data || {}),
      };
      const list = Object.entries(source).map(([id, payload]) => ({
        id,
        name: payload.name,
        classes: payload.classes || [],
      }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSpellCatalog(list);
    } catch (error) {
      console.error("Failed to load spells", error);
    }
  }, [serverUrl]);

  useEffect(() => {
    loadSpells();
  }, [loadSpells]);

  const availableWeapons = useMemo(() => {
    const matches = WEAPONS.filter(
      (weapon) =>
        !weapon.classes ||
        weapon.classes.length === 0 ||
        weapon.classes.includes(formClass)
    );
    if (matches.length) return matches;
    // fall back to any weapon so every class can equip something
    return WEAPONS.slice(0, 3);
  }, [formClass]);

  const availableWeaponIds = useMemo(
    () => availableWeapons.map((weapon) => weapon.id),
    [availableWeapons]
  );

  useEffect(() => {
    setSelectedWeapons((prev) => prev.filter((id) => availableWeaponIds.includes(id)));
  }, [availableWeaponIds]);

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId),
    [characters, selectedId]
  );

  const selectedStats = selected?.stats || {};

  const handleStatChange = useCallback((key, value) => {
    const filtered = value.replace(/[^0-9]/g, "");
    setFormStats((prev) => ({
      ...prev,
      [key]: filtered,
    }));
  }, []);

  const toggleWeapon = useCallback(
    (id) => {
      if (!availableWeaponIds.includes(id)) return;
      setSelectedWeapons((prev) => {
        if (prev.includes(id)) {
          return prev.filter((weaponId) => weaponId !== id);
        }
        if (prev.length >= 2) return prev;
        return [...prev, id];
      });
    },
    [availableWeaponIds]
  );

  const toggleSaveProficiency = useCallback((ability) => {
    setFormSaveProficiencies((prev) =>
      prev.includes(ability)
        ? prev.filter((item) => item !== ability)
        : [...prev, ability]
    );
  }, []);

  const toggleSkillProficiency = useCallback((skill) => {
    setFormSkillProficiencies((prev) =>
      prev.includes(skill)
        ? prev.filter((item) => item !== skill)
        : [...prev, skill]
    );
  }, []);

  const levelValue = Math.max(1, Number(formLevel) || 1);
  const proficiencyBonus = 2 + Math.floor((levelValue - 1) / 4);

  const selectedWeaponData = useMemo(
    () => availableWeapons.filter((weapon) => selectedWeapons.includes(weapon.id)),
    [availableWeapons, selectedWeapons]
  );

  const getSpellLevel = useCallback((spell) => {
    const parsed = Number(spell.level);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }, []);

  const classSpellCatalog = useMemo(() => {
    const lower = formClass.toLowerCase();
    return spellCatalog
      .filter(
        (spell) =>
          spell.classes &&
          spell.classes.some((cls) => cls?.toLowerCase() === lower)
      )
      .sort((a, b) => {
        const levelDiff = getSpellLevel(a) - getSpellLevel(b);
        if (levelDiff !== 0) return levelDiff;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [formClass, spellCatalog, getSpellLevel]);

  const classCantrips = useMemo(
    () => classSpellCatalog.filter((spell) => getSpellLevel(spell) === 0),
    [classSpellCatalog, getSpellLevel]
  );

  const classSpells = useMemo(
    () => classSpellCatalog.filter((spell) => getSpellLevel(spell) > 0),
    [classSpellCatalog, getSpellLevel]
  );

  const toggleSpellSelection = useCallback(
    (spell) => {
      const level = getSpellLevel(spell);
      const label = spell.name || spell.id;
      if (level === 0) {
        setSelectedCantrips((prev) =>
          prev.includes(label) ? prev.filter((entry) => entry !== label) : [...prev, label]
        );
        return;
      }
      setSelectedSpells((prev) =>
        prev.includes(label) ? prev.filter((entry) => entry !== label) : [...prev, label]
      );
    },
    [getSpellLevel]
  );

  const handleCreateCharacter = useCallback(async () => {
    if (createBusy) return;
    if (!selectedWeaponData.length) return;
    setCreateBusy(true);
    try {
      const statsPayload = Object.keys(formStats).reduce((acc, key) => {
        acc[key] = Number(formStats[key]) || 10;
        return acc;
      }, {});
      const weaponsPayload = selectedWeaponData.map((weapon) => {
        const score = Number(formStats[weapon.attack_ability]) || 10;
        const modifier = abilityMod(score);
        const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;
        return {
          name: weapon.name,
          attack_ability: weapon.attack_ability,
          damage: `${weapon.damage}${modifierText}`,
          damage_type: weapon.damage_type,
          finesse: weapon.finesse,
        };
      });
      const resolvedName =
        formName.trim() || `Adventurer ${Math.floor(Math.random() * 999)}`;
      const response = await apiPost(serverUrl, "/api/characters", {
        name: resolvedName,
        klass: formClass,
        level: levelValue,
        stats: statsPayload,
        armor_class: Number(formArmorClass) || 10,
        max_hp: Number(formMaxHp) || 10,
        weapons: weaponsPayload,
        race: formRace,
        background: formBackground,
        alignment: formAlignment,
        traits: parseList(formTraits),
        languages: parseList(formLanguages),
        items: parseList(formItems),
        spellcasting_ability: formSpellcastingAbility,
        cantrips_known: selectedCantrips,
        spellbook: selectedSpells,
        prepared_spells: [],
        known_spells: selectedSpells,
        save_proficiencies: formSaveProficiencies,
        skill_proficiencies: formSkillProficiencies,
      });
      setFormName("");
      setFormLevel("1");
      setFormClass(CLASSES[0]);
      setFormRace(RACES[0]);
      setFormBackground(BACKGROUNDS[0]);
      setFormAlignment(ALIGNMENTS[0]);
      setFormStats({ ...DEFAULT_STATS });
      setFormArmorClass("10");
      setFormMaxHp("10");
      setFormSpellcastingAbility("wis");
      setSelectedCantrips([]);
      setSelectedSpells([]);
      setFormItems("");
      setFormTraits("");
      setFormLanguages("");
      setFormSaveProficiencies([]);
      setFormSkillProficiencies([]);
      setSelectedWeapons([WEAPONS[0].id]);
      await loadCharacters();
      onCharacterCreated?.({
        name: resolvedName,
        klass: formClass,
        level: levelValue,
      });
    } catch (error) {
      console.error("Failed to create character", error);
    } finally {
      setCreateBusy(false);
    }
  }, [
    createBusy,
    formName,
    formClass,
    formLevel,
    formStats,
    formArmorClass,
    formMaxHp,
    formRace,
    formBackground,
    formAlignment,
    formSpellcastingAbility,
    formItems,
    formTraits,
    formLanguages,
    formSaveProficiencies,
    formSkillProficiencies,
    selectedWeaponData,
    selectedCantrips,
    selectedSpells,
    serverUrl,
    loadCharacters,
    levelValue,
    onCharacterCreated,
  ]);
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
    <ScrollView contentContainerStyle={styles.content} style={styles.scrollArea}>
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

      <Section title="Create Character">
        <TextInput
          style={styles.formInput}
          value={formName}
          onChangeText={setFormName}
          placeholder="Character Name"
          placeholderTextColor={colors.mutedGold}
        />
          <View style={styles.infoRow}>
            <TextInput
              style={[styles.formInput, styles.smallInput]}
              value={formLevel}
              onChangeText={(value) => setFormLevel(value.replace(/[^0-9]/g, ""))}
              placeholder="Level"
              placeholderTextColor={colors.mutedGold}
              keyboardType="numeric"
            />
            <View style={styles.proficiencyCard}>
              <Text style={styles.statLabelSmall}>Proficiency</Text>
              <Text style={styles.statValue}>+{proficiencyBonus}</Text>
            </View>
          </View>
          <View style={styles.selectorRow}>
            {CLASSES.map((klass) => (
              <Pressable
                key={klass}
                onPress={() => setFormClass(klass)}
                style={[
                  styles.selector,
                  formClass === klass && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{klass}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.selectorRow}>
            {RACES.map((race) => (
              <Pressable
                key={race}
                onPress={() => setFormRace(race)}
                style={[
                  styles.selector,
                  formRace === race && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{race}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.selectorRow}>
            {BACKGROUNDS.map((background) => (
              <Pressable
                key={background}
                onPress={() => setFormBackground(background)}
                style={[
                  styles.selector,
                  formBackground === background && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{background}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.selectorRow}>
            {ALIGNMENTS.map((alignment) => (
              <Pressable
                key={alignment}
                onPress={() => setFormAlignment(alignment)}
                style={[
                  styles.selector,
                  formAlignment === alignment && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{alignment}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.statGrid}>
            {Object.entries(formStats).map(([key, value]) => {
              const score = Number(value) || 10;
              return (
                <View key={key} style={styles.statBlock}>
                  <Text style={styles.statLabelSmall}>{key.toUpperCase()}</Text>
                  <TextInput
                    style={styles.statInput}
                    value={String(score)}
                    onChangeText={(next) => handleStatChange(key, next)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.statMod}>{formatModifier(abilityMod(score))}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.statLabelSmall, styles.sectionLabel]}>Weapons</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.weaponRow}>
              {availableWeapons.map((weapon) => {
                const isActive = selectedWeapons.includes(weapon.id);
                const score = Number(formStats[weapon.attack_ability]) || 10;
                return (
                  <Pressable
                    key={weapon.id}
                    onPress={() => toggleWeapon(weapon.id)}
                    style={[
                      styles.weaponCard,
                      isActive && styles.weaponCardActive,
                    ]}
                  >
                    <Text style={styles.weaponName}>{weapon.name}</Text>
                    <Text style={styles.weaponMeta}>
                      {weapon.attack_ability.toUpperCase()} ·{" "}
                      {weapon.damage_type}
                    </Text>
                    <Text style={styles.weaponMeta}>
                      {weapon.damage.split("+")[0]}
                      {abilityMod(score) >= 0
                        ? `+${abilityMod(score)}`
                        : abilityMod(score)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
            Save Proficiencies
          </Text>
          <View style={styles.selectorRow}>
            {Object.keys(formStats).map((ability) => (
              <Pressable
                key={ability}
                onPress={() => toggleSaveProficiency(ability)}
                style={[
                  styles.selector,
                  formSaveProficiencies.includes(ability) && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{ability.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
            Skill Proficiencies
          </Text>
          <View style={styles.selectorRow}>
            {SKILLS.map((skill) => (
              <Pressable
                key={skill}
                onPress={() => toggleSkillProficiency(skill)}
                style={[
                  styles.selector,
                  formSkillProficiencies.includes(skill) && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{skill}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
            Spellcasting
          </Text>
          <TextInput
            style={styles.formInput}
            value={formSpellcastingAbility}
            onChangeText={setFormSpellcastingAbility}
            placeholder="Spellcasting ability (e.g. wis)"
            placeholderTextColor={colors.mutedGold}
          />
          {classCantrips.length ? (
            <View style={styles.spellGroup}>
              <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
                Cantrips
              </Text>
              <View style={styles.spellRow}>
                {classCantrips.map((spell) => {
                  const selected = selectedCantrips.includes(spell.id);
                  return (
                    <Pressable
                      key={spell.id}
                      onPress={() => toggleSpellSelection(spell)}
                      style={[
                        styles.spellButton,
                        selected && styles.spellButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.spellButtonText,
                          selected && styles.spellButtonTextActive,
                        ]}
                      >
                        {spell.name || spell.id}
                      </Text>
                      <Text style={styles.spellMeta}>Cantrip</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {classSpells.length ? (
            <View style={styles.spellGroup}>
              <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
                Spells
              </Text>
              <View style={styles.spellRow}>
                {classSpells.map((spell) => {
                  const selected = selectedSpells.includes(spell.id);
                  return (
                    <Pressable
                      key={spell.id}
                      onPress={() => toggleSpellSelection(spell)}
                      style={[
                        styles.spellButton,
                        selected && styles.spellButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.spellButtonText,
                          selected && styles.spellButtonTextActive,
                        ]}
                      >
                        {spell.name || spell.id}
                      </Text>
                      <Text style={styles.spellMeta}>
                        Lvl {getSpellLevel(spell)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <TextInput
            style={[styles.formInput, styles.multilineInput]}
            value={formItems}
            onChangeText={setFormItems}
            placeholder="Inventory / Items"
            placeholderTextColor={colors.mutedGold}
            multiline
          />
          <TextInput
            style={[styles.formInput, styles.multilineInput]}
            value={formTraits}
            onChangeText={setFormTraits}
            placeholder="Traits / Feats"
            placeholderTextColor={colors.mutedGold}
            multiline
          />
          <TextInput
            style={[styles.formInput, styles.multilineInput]}
            value={formLanguages}
            onChangeText={setFormLanguages}
            placeholder="Languages"
            placeholderTextColor={colors.mutedGold}
            multiline
          />
          <Button
            label={createBusy ? "..." : "Create Character"}
            onPress={handleCreateCharacter}
            disabled={createBusy}
          />
      </Section>

      <Section title="Sheet">
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.meta}>
              {selected.klass} | Level {selected.level} | {selectedType}
            </Text>
            <View style={styles.sheetMetaRow}>
              <View style={styles.sheetMetaCard}>
                <Text style={styles.sheetMetaLabel}>Armor Class</Text>
                <Text style={styles.sheetMetaValue}>{formatValue(selected.armor_class)}</Text>
              </View>
              <View style={styles.sheetMetaCard}>
                <Text style={styles.sheetMetaLabel}>Hit Points</Text>
                <Text style={styles.sheetMetaValue}>{formatValue(selected.max_hp)}</Text>
              </View>
              <View style={styles.sheetMetaCard}>
                <Text style={styles.sheetMetaLabel}>Proficiency</Text>
                <Text style={styles.sheetMetaValue}>
                  +{selected.level ? 2 + Math.floor((Number(selected.level) - 1) / 4) : 2}
                </Text>
              </View>
            </View>
            <View style={styles.sheetStats}>
              {Object.entries(selectedStats).map(([key, value]) => {
                const numeric = Number(value) || 0;
                return (
                  <View key={key} style={styles.sheetStatBlock}>
                    <Text style={styles.sheetStatLabel}>{key.toUpperCase()}</Text>
                    <Text style={styles.sheetStatValue}>{formatValue(value)}</Text>
                    <Text style={styles.sheetStatMod}>
                      {formatModifier(abilityMod(numeric))}
                    </Text>
                  </View>
                );
              })}
            </View>
            {selected.weapons?.length ? (
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Weapons</Text>
                <View style={styles.sheetList}>
                  {selected.weapons.map((weapon, index) => (
                    <Text
                      key={weapon.name + "-" + index}
                      style={styles.sheetListItem}
                    >
                      {weapon.name} ({weapon.damage || "-"}) - {weapon.damage_type || "-"} -
                      {weapon.attack_ability?.toUpperCase() || "-"}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}
            {Array.isArray(selected.known_spells) && selected.known_spells.length ? (
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Known Spells</Text>
                <Text style={styles.sheetListItem}>{selected.known_spells.join(", ")}</Text>
              </View>
            ) : null}
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
    paddingHorizontal: 0,
    width: "100%",
    alignItems: "stretch",
  },
  scrollArea: {
    width: "100%",
    flex: 1,
    flexGrow: 1,
    alignSelf: "stretch",
  },
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.parchment,
    backgroundColor: colors.panel,
    marginBottom: spacing.sm,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  smallInput: {
    width: 110,
  },
  infoRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    rowGap: spacing.xs,
    columnGap: spacing.xs,
    marginBottom: spacing.xs,
    width: "100%",
    alignItems: "flex-start",
    alignContent: "flex-start",
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  selectorActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  selectorText: {
    color: colors.parchment,
    letterSpacing: 1,
    fontSize: 12,
  },
  spellRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    justifyContent: "space-between",
  },
  spellGroup: {
    gap: spacing.xs,
  },
  spellButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panel,
    flexBasis: "48%",
    maxWidth: "48%",
  },
  spellButtonActive: {
    borderColor: colors.gold,
    backgroundColor: colors.panelAlt,
  },
  spellMeta: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  spellButtonText: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  spellButtonTextActive: {
    color: colors.parchment,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statBlock: {
    width: "30%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.panel,
  },
  statLabelSmall: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  statInput: {
    width: "100%",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    color: colors.parchment,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  statMod: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  proficiencyCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.panel,
    justifyContent: "center",
  },
  statValue: {
    color: colors.parchment,
    fontSize: 16,
    fontWeight: "700",
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    fontSize: 12,
    color: colors.mutedGold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sheetMetaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetMetaCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.panelAlt,
    alignItems: "center",
  },
  sheetMetaLabel: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sheetMetaValue: {
    color: colors.parchment,
    fontSize: 14,
    fontWeight: "700",
  },
  sheetStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetStatBlock: {
    width: "30%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.panel,
  },
  sheetStatLabel: {
    color: colors.mutedGold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  sheetStatValue: {
    color: colors.parchment,
    fontSize: 14,
    fontWeight: "700",
  },
  sheetStatMod: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  sheetSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sheetSectionTitle: {
    color: colors.mutedGold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sheetList: {
    marginTop: spacing.xs,
  },
  sheetListItem: {
    color: colors.parchment,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  weaponRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  weaponCard: {
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.panel,
  },
  weaponCardActive: {
    borderColor: colors.gold,
    backgroundColor: colors.panelAlt,
  },
  weaponName: {
    color: colors.parchment,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  weaponMeta: {
    color: colors.mutedGold,
    fontSize: 10,
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





