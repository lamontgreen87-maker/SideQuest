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
  const [formLevel, setFormLevel] = useState("1");
  const [formClass, setFormClass] = useState(CLASSES[0]);
  const [formRace, setFormRace] = useState(RACES[0]);
  const [formBackground, setFormBackground] = useState(BACKGROUNDS[0]);
  const [formAlignment, setFormAlignment] = useState(ALIGNMENTS[0]);
  const [formGender, setFormGender] = useState("Male");
  const [formBackstory, setFormBackstory] = useState("");
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
        klass: formClass,
        level: levelValue,
        stats: statsPayload,
        armor_class: Number(formArmorClass) || 10,
        max_hp: Number(formMaxHp) || 10,
        weapons: weaponsPayload,
        race: formRace,
        background: formBackground,
        alignment: formAlignment,
        gender: formGender,
        backstory: formBackstory,
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

      // Show generated backstory if one was created
      if (response?.backstory) {
        alert(`Your character's backstory:\n\n${response.backstory}`);
      }
      setFormName("");
      setFormLevel("1");
      setFormClass(CLASSES[0]);
      setFormRace(RACES[0]);
      setFormBackground(BACKGROUNDS[0]);
      setFormAlignment(ALIGNMENTS[0]);
      setFormGender("Male");
      setFormBackstory("");
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
    formClass,
    formLevel,
    formStats,
    formArmorClass,
    formMaxHp,
    formRace,
    formBackground,
    formAlignment,
    formGender,
    formBackstory,
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
        <Text style={[styles.statLabelSmall, styles.sectionLabel]}>
          Gender
        </Text>
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
        <TextInput
          style={[styles.formInput, styles.multilineInput, styles.backstoryInput]}
          value={formBackstory}
          onChangeText={setFormBackstory}
          placeholder="Backstory (optional - AI will generate one if left empty)"
          placeholderTextColor={colors.mutedGold}
          multiline
          numberOfLines={4}
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
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scrollArea: {
    flex: 1,
    width: "100%",
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
  selectorGroup: {
    marginBottom: spacing.md,
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  alignmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  alignmentButton: {
    width: "30.5%",
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  alignmentText: {
    textAlign: "center",
    fontSize: 10,
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
  formError: {
    color: colors.accent,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  weaponRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  weaponCard: {
    flexBasis: "48%",
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
  backstoryInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
});







