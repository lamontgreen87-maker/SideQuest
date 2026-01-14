import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Button from "../components/Button";
import Section from "../components/Section";
import { apiGet, apiPost } from "../api/client";
import { theme } from "../theme";
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

const GENDERS = ["Male", "Female", "Other"];

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

const formatModifier = (mod) => (mod >= 0 ? `+${mod}` : `${mod}`);

function abilityMod(score) {
  return Math.floor((score - 10) / 2);
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

export default function CharacterScreen({
  serverUrl,
  onCharacterCreated,
  scrollEnabled = true,
}) {
  const [createBusy, setCreateBusy] = useState(false);
  const createInFlightRef = useRef(false);

  const [formName, setFormName] = useState("");
  const [formGender, setFormGender] = useState(GENDERS[0]);
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
  const [formError, setFormError] = useState("");

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
        classes: normalizeSpellClasses(payload.classes),
        level: payload.level,
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
      setFormError("");
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

  const optimizeStats = useCallback(() => {
    // Standard Array
    const standard = ["15", "14", "13", "12", "10", "8"];
    // Priority Map: High to Low
    const priorities = {
      Barbarian: ["str", "con", "dex", "wis", "int", "cha"],
      Bard: ["cha", "dex", "con", "wis", "int", "str"],
      Cleric: ["wis", "con", "str", "cha", "int", "dex"],
      Druid: ["wis", "con", "dex", "int", "cha", "str"],
      Fighter: ["str", "con", "dex", "wis", "int", "cha"], // Strength based default
      Monk: ["dex", "wis", "con", "str", "int", "cha"],
      Paladin: ["str", "cha", "con", "wis", "dex", "int"],
      Ranger: ["dex", "wis", "con", "int", "str", "cha"],
      Rogue: ["dex", "cha", "int", "con", "wis", "str"],
      Sorcerer: ["cha", "con", "dex", "wis", "int", "str"],
      Warlock: ["cha", "con", "dex", "wis", "int", "str"],
      Wizard: ["int", "con", "dex", "wis", "cha", "str"],
    };

    const order = priorities[formClass] || priorities.Fighter;
    const newStats = { ...DEFAULT_STATS };

    order.forEach((stat, index) => {
      newStats[stat] = standard[index] || "10";
    });
    setFormStats(newStats);
  }, [formClass]);

  const rollStats = useCallback(() => {
    const roll4d6drop1 = () => {
      const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      rolls.sort((a, b) => a - b);
      return rolls.slice(1).reduce((a, b) => a + b, 0);
    };

    const newStats = { ...DEFAULT_STATS };
    Object.keys(newStats).forEach((key) => {
      newStats[key] = String(roll4d6drop1());
    });
    setFormStats(newStats);
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
    if (createBusy || createInFlightRef.current) return;
    if (!selectedWeaponData.length) {
      setFormError("Choose at least one weapon before creating your character.");
      return;
    }
    createInFlightRef.current = true;
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
        gender: formGender,
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
      setFormGender(GENDERS[0]);
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
      setFormError("");
      onCharacterCreated?.({
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        id: response?.character_id || null,
        name: resolvedName,
        gender: formGender,
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
        conditions: [],
      });
    } catch (error) {
      console.error("Failed to create character", error);
    } finally {
      createInFlightRef.current = false;
      setCreateBusy(false);
    }
  }, [
    createBusy,
    formName,
    formGender,
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
    levelValue,
    onCharacterCreated,
  ]);

  const content = (
    <>
      <Section title="Create Character">
        <TextInput
          style={styles.formInput}
          value={formName}
          onChangeText={setFormName}
          placeholder="Character Name"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <View style={styles.selectorGroup}>
          <View style={styles.selectorRow}>
            {GENDERS.map((gender) => (
              <Pressable
                key={gender}
                onPress={() => setFormGender(gender)}
                style={[
                  styles.selector,
                  formGender === gender && styles.selectorActive,
                ]}
              >
                <Text style={styles.selectorText}>{gender}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.infoRow}>
          <TextInput
            style={[styles.formInput, styles.smallInput]}
            value={formLevel}
            onChangeText={(value) => setFormLevel(value.replace(/[^0-9]/g, ""))}
            placeholder="Level"
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="numeric"
          />
          <View style={styles.proficiencyCard}>
            <Text style={styles.statLabelSmall}>Proficiency</Text>
            <Text style={styles.statValue}>+{proficiencyBonus}</Text>
          </View>
        </View>
        <View style={styles.selectorGroup}>
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
        </View>
        <View style={styles.selectorGroup}>
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
        </View>
        <View style={styles.selectorGroup}>
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
        </View>
        <View style={styles.selectorGroup}>
          <View style={styles.alignmentGrid}>
            {ALIGNMENTS.map((alignment) => (
              <Pressable
                key={alignment}
                onPress={() => setFormAlignment(alignment)}
                style={[
                  styles.selector,
                  styles.alignmentButton,
                  formAlignment === alignment && styles.selectorActive,
                ]}
              >
                <Text style={[styles.selectorText, styles.alignmentText]}>
                  {alignment}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.statActions}>
          <Pressable style={styles.actionButton} onPress={optimizeStats}>
            <Text style={styles.actionButtonText}>🚀 Optimize for Class</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={rollStats}>
            <Text style={styles.actionButtonText}>🎲 Roll Stats (4d6)</Text>
          </Pressable>
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
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
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
                  {weapon.attack_ability.toUpperCase()} Aú{" "}
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
          placeholderTextColor={theme.colors.textSecondary}
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
          placeholderTextColor={theme.colors.textSecondary}
          multiline
        />
        <TextInput
          style={[styles.formInput, styles.multilineInput]}
          value={formTraits}
          onChangeText={setFormTraits}
          placeholder="Traits / Feats"
          placeholderTextColor={theme.colors.textSecondary}
          multiline
        />
        <TextInput
          style={[styles.formInput, styles.multilineInput]}
          value={formLanguages}
          onChangeText={setFormLanguages}
          placeholder="Languages"
          placeholderTextColor={theme.colors.textSecondary}
          multiline
        />
        <Button
          label={createBusy ? "..." : "Create Character"}
          onPress={handleCreateCharacter}
          disabled={createBusy}
        />
      </Section>

    </>
  );

  if (!scrollEnabled) {
    return <View style={styles.content}>{content}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.scrollArea}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  scrollArea: {
    flex: 1,
    width: "100%",
  },
  formInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.textPrimary,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: theme.spacing.sm,
    fontFamily: theme.fonts.body,
    fontSize: 16,
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
    gap: theme.spacing.sm,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    rowGap: theme.spacing.xs,
    columnGap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    width: "100%",
    alignItems: "flex-start",
    alignContent: "flex-start",
  },
  selectorGroup: {
    marginBottom: theme.spacing.md,
  },
  selector: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    minHeight: 32,
    justifyContent: 'center',
  },
  alignmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: theme.spacing.xs,
  },
  alignmentButton: {
    width: "30.5%",
    aspectRatio: 1,
    borderRadius: theme.layout.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xs,
  },
  alignmentText: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: theme.fonts.body,
  },
  selectorActive: {
    backgroundColor: 'rgba(197, 160, 89, 0.15)',
    borderColor: theme.colors.gold,
  },
  selectorText: {
    color: theme.colors.textMuted,
    letterSpacing: 1,
    fontSize: 12,
    fontFamily: theme.fonts.body,
    textTransform: 'uppercase',
  },
  spellRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    justifyContent: "space-between",
  },
  spellGroup: {
    gap: theme.spacing.xs,
  },
  spellButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    flexBasis: "48%",
    maxWidth: "48%",
  },
  spellButtonActive: {
    borderColor: theme.colors.gold,
    backgroundColor: 'rgba(197, 160, 89, 0.15)',
  },
  spellMeta: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: theme.spacing.xs,
    fontFamily: theme.fonts.body,
  },
  spellButtonText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  spellButtonTextActive: {
    color: theme.colors.gold,
    fontWeight: 'bold',
  },
  statActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.layout.radius.sm,
    alignItems: "center",
  },
  actionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.fonts.button,
    letterSpacing: 1,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  statBlock: {
    width: "30%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    padding: theme.spacing.sm,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  statLabelSmall: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: theme.spacing.xs,
    fontFamily: theme.fonts.body,
  },
  statInput: {
    width: "100%",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    color: theme.colors.gold,
    fontSize: 16,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.fonts.header,
    fontWeight: 'bold',
  },
  statMod: {
    color: theme.colors.goldDim,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  proficiencyCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
  },
  statValue: {
    color: theme.colors.gold,
    fontSize: 18,
    fontFamily: theme.fonts.header,
    fontWeight: "700",
  },
  sectionLabel: {
    marginBottom: theme.spacing.sm,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: theme.fonts.body,
  },
  formError: {
    color: theme.colors.crimson,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.fonts.body,
  },
  weaponRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    justifyContent: "space-between",
  },
  weaponCard: {
    flexBasis: "48%",
    minWidth: 140,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  weaponCardActive: {
    borderColor: theme.colors.gold,
    backgroundColor: 'rgba(197, 160, 89, 0.15)',
  },
  weaponName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.fonts.body,
    fontWeight: "600",
    marginBottom: theme.spacing.xs,
  },
  weaponMeta: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontFamily: theme.fonts.body,
  },
});







