import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../components/Button";
import { DispositionMeter } from "../components/DispositionMeter";
import { FantasyCard } from "../components/FantasyCard";
import { apiGet, apiPost, apiStream } from "../api/client";
import { INTRO_PROMPTS, STORAGE_KEYS } from "../config";

import { getJson, removeItem, setJson } from "../storage";
import { theme } from "../theme";
import { DEFAULT_ENEMIES, DEFAULT_PREMADES, DEFAULT_SPELLS } from "../data/dnd";

const storyCache = {
  messages: [],
  sessionId: null,
  introKey: null,
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
  "tuning crystal bells",
  "teaching bats to bow",
  "fermenting moon honey",
  "stacking spiral stones",
  "arguing with mushrooms",
  "ironing a dragon's cape",
  "resetting rune puzzles",
  "measuring shadow lengths",
  "inflating cloud sheep",
  "polishing cursed spoons",
  "sorting star feathers",
  "bottling thunder echoes",
  "sweeping basilisk dust",
  "stirring a lava latte",
  "braiding river reeds",
  "wrangling mimic stools",
  "counting ghost footprints",
  "whittling luck charms",
  "folding quiet storms",
  "charging lantern sprites",
  "teaching owls to whisper",
  "sketching secret stairways",
  "rinsing goblin tea cups",
  "taming unruly quills",
  "counting honest coins",
  "sharpening moonlight",
  "brewing moss tonic",
  "dusting ancient sigils",
  "knitting frost scarves",
  "soothing angry lanterns",
  "baking stone biscuits",
  "polishing phantom armor",
  "sorting spell crumbs",
  "braiding comet tails",
  "patching leaky portals",
  "painting door hinges",
  "teaching trolls manners",
  "untangling fate threads",
  "warming the runes",
  "mending shadow cloaks",
  "winding the wind-up owl",
  "counting catacomb steps",
  "testing trick mirrors",
  "brewing courage stew",
  "wrapping echo jars",
  "sanding dragon scales",
  "shuffling prophecy cards",
  "harvesting glow lichen",
  "stacking time tokens",
  "whispering to the map",
  "filling ink wells",
  "aligning the ley lines",
  "dimming the ceiling stars",
  "straightening crooked hats",
  "dusting the crystal ball",
];
const INTRO_FALLBACKS = [
  "A lantern sputters beside a mossy stairwell that drops into a ruin no map admits. Damp air tastes of iron and old incense, and something below answers your footstep with a slow, waiting scrape. Your hand closes around a cracked stone charm that hums with a warning. Do you descend or search the threshold for a safer way in?",
  "Stormlight flashes over a ridge of broken pillars as the earth rumbles beneath your boots. A hidden door has opened in the hillside, exhaling warm breath and the faint scent of spice and ash. Somewhere inside, a bell rings once, then stops. What do you do?",
  "A low chant rises from the valley, and the torches along the old road flare as you approach. The shrine ahead is half-collapsed, its altar split, yet fresh footprints circle the entrance. Your pack shifts as if something inside wants out. Will you enter, scout, or call out?",
];
let lastIntroIndex = -1;
let lastFallbackIndex = -1;

function pickIntro() {
  if (!INTRO_PROMPTS.length) return "";
  let index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  if (INTRO_PROMPTS.length > 1 && index === lastIntroIndex) {
    index = (index + 1) % INTRO_PROMPTS.length;
  }
  lastIntroIndex = index;
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

function pickFallbackIntro() {
  if (!INTRO_FALLBACKS.length) return "";
  let index = Math.floor(Math.random() * INTRO_FALLBACKS.length);
  if (INTRO_FALLBACKS.length > 1 && index === lastFallbackIndex) {
    index = (index + 1) % INTRO_FALLBACKS.length;
  }
  lastFallbackIndex = index;
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
  if (trimmed.length < 30) return null;
  if (looksLikePrompt(trimmed)) return null;
  return trimmed;
}

function stripThinking(text) {
  if (!text) return text;
  let cleaned = String(text);
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^(thoughts?|thinking|analysis)\s*:\s*/i, "").trim();
  return cleaned;
}

export default function StoryScreen({
  serverUrl,
  onCreditsUpdate,
  onNavigate,
  characterEntry,
  onCharacterEntryHandled,
  sessionEntry,
  onSessionEntryHandled,
  resetSessionToken,
  currentCharacter,
  onUnauthorized,
}) {
  const messageSeq = useRef(0);
  const introRequestRef = useRef({ key: null, inFlight: false });
  const sessionRequestRef = useRef(null);
  const suppressColdStartRef = useRef(false);
  const sessionInvalidRef = useRef(false);
  const makeId = useCallback(
    () => `${Date.now()}-${messageSeq.current++}`,
    []
  );
  const normalizeMessages = useCallback(
    (list) =>
      (list || []).map((msg) =>
        msg?.id
          ? msg
          : {
            ...msg,
            id: makeId(),
          }
      ),
    [makeId]
  );
  const [attraction, setAttraction] = useState(0);
  const [sessionId, setSessionId] = useState(storyCache.sessionId);
  const [messages, setMessages] = useState(
    storyCache.messages.length ? normalizeMessages(storyCache.messages) : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendReady, setResendReady] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [internalCharacter, setInternalCharacter] = useState(currentCharacter);
  useEffect(() => {
    setInternalCharacter(currentCharacter);
  }, [currentCharacter]);
  const [pcs, setPcs] = useState([]);
  const [pcCatalog, setPcCatalog] = useState({});
  const [pcId, setPcId] = useState(null);
  const [enemyId, setEnemyId] = useState(null);
  const [enemyCatalog, setEnemyCatalog] = useState({});
  const [rulesSessionId, setRulesSessionId] = useState(null);
  const [weaponId, setWeaponId] = useState(null);
  const [weaponOptions, setWeaponOptions] = useState([]);
  const [combatBusy, setCombatBusy] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [showSpellMenu, setShowSpellMenu] = useState(false);
  const [spellMenuOptions, setSpellMenuOptions] = useState([]);
  const [spellMenuLoading, setSpellMenuLoading] = useState(false);
  const [spellCatalogMap, setSpellCatalogMap] = useState({});
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryInput, setInventoryInput] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const drawerAnimation = useRef(new Animated.Value(0)).current;
  const [checkMode, setCheckMode] = useState("skill");
  const [checkResult, setCheckResult] = useState(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [checkUsed, setCheckUsed] = useState(false);
  const [rulesSeeded, setRulesSeeded] = useState(false);
  const [adventureLoading, setAdventureLoading] = useState(false);
  const [loadingFlavorIndex, setLoadingFlavorIndex] = useState(0);
  const keyboardTranslate = useRef(new Animated.Value(0)).current;
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const shouldNarrate = useCallback(() => Math.random() < 0.5, []);
  const ensureSessionRef = useRef(null);
  const fetchSessionIntroRef = useRef(null);
  const makeMessageRef = useRef(null);
  const onCharacterEntryHandledRef = useRef(null);
  const normalizeSpellKey = useCallback(
    (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " "),
    []
  );
  const selectedPc = useMemo(() => pcCatalog[pcId] || null, [pcCatalog, pcId]);
  const normalizeSpellClasses = useCallback((value) => {
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
  }, []);
  const spellOptions = useMemo(() => {
    const source = internalCharacter || {};
    const combined = [
      ...(source.prepared_spells || []),
      ...(source.known_spells || []),
      ...(source.spellbook || []),
    ];
    const unique = [...new Set(combined.map((entry) => String(entry).trim()).filter(Boolean))];
    return unique;
  }, [internalCharacter]);
  const combinedSpellOptions = useMemo(
    () => (spellOptions.length ? spellOptions : spellMenuOptions),
    [spellOptions, spellMenuOptions]
  );
  const resolveEncounterEnemyId = useCallback(
    (encounter) => {
      if (!encounter) return null;
      if (typeof encounter === "string") {
        const name = encounter.trim().toLowerCase();
        const match = Object.entries(enemyCatalog).find(
          ([, payload]) => String(payload?.name || "").trim().toLowerCase() === name
        );
        return match ? match[0] : null;
      }
      if (encounter.id) return encounter.id;
      const rawName =
        encounter.name || encounter.monster || encounter.enemy || "";
      const cleanedName = String(rawName).trim().toLowerCase();
      if (!cleanedName) return null;
      const match = Object.entries(enemyCatalog).find(
        ([, payload]) => String(payload?.name || "").trim().toLowerCase() === cleanedName
      );
      return match ? match[0] : null;
    },
    [enemyCatalog]
  );
  const buildSessionTitle = useCallback((list) => {
    const firstAssistant = list.find((msg) => msg.role === "assistant");
    const raw = firstAssistant?.content || "New Adventure";
    const cleaned = raw.replace(/\s+/g, " ").trim();
    return cleaned.length > 48 ? `${cleaned.slice(0, 48)}...` : cleaned;
  }, [makeMessage]);
  const buildSessionPreview = useCallback((list) => {
    const lastAssistant = [...list].reverse().find((msg) => msg.role === "assistant");
    const raw = lastAssistant?.content || "";
    const cleaned = raw.replace(/\s+/g, " ").trim();
    return cleaned.length > 80 ? `${cleaned.slice(0, 80)}...` : cleaned;
  }, [makeMessage]);
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
  const isRemoteServer = useMemo(
    () => typeof serverUrl === "string" && serverUrl.includes("sidequestai.org"),
    [serverUrl]
  );
  const makeMessage = useCallback(
    (role, content) => ({
      id: makeId(),
      role,
      content,
    }),
    [makeId]
  );
  const shouldCheckStatus = useCallback((errorMessage) => {
    if (!errorMessage) return false;
    const text = String(errorMessage).toLowerCase();
    return text.includes("524") || text.includes("timeout") || text.includes("timed out");
  }, [makeMessage]);
  const sleep = useCallback(
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    []
  );
  const pollSessionReply = useCallback(
    async (id, attempts = 6, delayMs = 5000) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const status = await apiGet(serverUrl, `/api/sessions/${id}/status`);
          const serverReply = status?.last_assistant_message;
          if (!status?.pending_reply && serverReply) {
            return serverReply;
          }
        } catch (error) {
          // ignore and keep polling
        }
        await sleep(delayMs);
      }
      return null;
    },
    [serverUrl, sleep]
  );

  const appendAssistantResponse = useCallback(
    (response) => {
      if (!response) return;
      const encounter = response?.encounter;
      const triggerEncounter = () => {
        if (encounter) {
          setMessages((prev) => [
            ...prev,
            makeMessage("system", "AN ENEMY APPEARS: FIGHT!")
          ]);
          handleEncounterStart(encounter);
        }
      };
      const nextInventory = response?.game_state?.inventory;
      setInventoryItems(nextInventory);

      const nextAttraction = response?.game_state?.attraction_score;
      if (typeof nextAttraction === 'number') {
        setAttraction(nextAttraction);
      }
      if (Array.isArray(response?.response_parts) && response.response_parts.length) {
        response.response_parts.forEach((part) => {
          const cleaned = stripThinking(part);
          if (!cleaned) return;
          setMessages((prev) => {
            const lastAssistant = [...prev].reverse().find((msg) => msg.role === "assistant");
            if (lastAssistant?.content === cleaned) return prev;
            return [...prev, makeMessage("assistant", cleaned)];
          });
        });
        triggerEncounter();
        return;
      }
      const aiContent = stripThinking(
        response?.response ??
        response?.assistant ??
        response?.content ??
        response?.narration ??
        response?.message
      );
      if (aiContent) {
        setMessages((prev) => {
          const lastAssistant = [...prev].reverse().find((msg) => msg.role === "assistant");
          if (lastAssistant?.content === aiContent) return prev;
          return [...prev, makeMessage("assistant", aiContent)];
        });
      }
      triggerEncounter();
    },
    [makeMessage, handleEncounterStart]
  );

  const ensureSession = useCallback(async () => {
    if (sessionId && !sessionInvalidRef.current) {
      return sessionId;
    }
    if (sessionRequestRef.current) {
      return sessionRequestRef.current;
    }
    const request = apiPost(serverUrl, "/api/sessions", {
      messages: messages.length ? messages : undefined,
    })
      .then(async (response) => {
        setSessionId(response.session_id);
        sessionInvalidRef.current = false;
        await setJson(STORAGE_KEYS.lastSession, response.session_id);
        return response.session_id;
      })
      .finally(() => {
        sessionRequestRef.current = null;
      });
    sessionRequestRef.current = request;
    return request;
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
        return stripThinking(response?.intro || null);
      } catch (error) {
        return null;
      }
    },
    [serverUrl]
  );

  const fetchSessionIntro = useCallback(
    async (id, character) => {
      try {
        const payload = {
          name: character?.name || undefined,
          klass: character?.klass || undefined,
          character: character || undefined,
        };
        const response = await Promise.race([
          apiPost(serverUrl, `/api/sessions/${id}/intro`, payload),
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (!response) return null;
        return response?.intro ? sanitizeIntro(response.intro) : null;
      } catch (error) {
        return null;
      }
    },
    [serverUrl]
  );

  const withHealthGuard = useCallback(
    (requestFn) =>
      new Promise((resolve, reject) => {
        let settled = false;
        let failures = 0;
        const interval = setInterval(async () => {
          if (settled) return;
          try {
            await apiGet(serverUrl, "/health");
            failures = 0;
          } catch (error) {
            failures += 1;
            if (failures >= 3) {
              settled = true;
              clearInterval(interval);
              reject(new Error("Server not reachable."));
            }
          }
        }, 20000);

        requestFn()
          .then((result) => {
            if (settled) return;
            settled = true;
            clearInterval(interval);
            resolve(result);
          })
          .catch((error) => {
            if (settled) return;
            settled = true;
            clearInterval(interval);
            reject(error);
          });
      }),
    [serverUrl]
  );

  const getIntro = useCallback(
    async (name, klass) => {
      const apiIntro = sanitizeIntro(await fetchAiIntro(name, klass));
      if (apiIntro) return apiIntro;
      return pickFallbackIntro() || pickIntro();
    },
    [fetchAiIntro]
  );

  const loadSession = useCallback(async () => {
    if (characterEntry || suppressColdStartRef.current) {
      return;
    }
    if (messages.length) {
      setAdventureLoading(false);
      return;
    }
    const introKey = "cold-start";
    if (storyCache.introKey === introKey) {
      return;
    }
    if (introRequestRef.current.inFlight) {
      return;
    }
    if (introRequestRef.current.key === introKey) {
      return;
    }
    introRequestRef.current = { key: introKey, inFlight: true };
    storyCache.introKey = introKey;
    const storedId = await getJson(STORAGE_KEYS.lastSession, null);
    if (storedId) {
      setSessionId(storedId);
      const storedSessions = await getJson(STORAGE_KEYS.sessions, []);
      const entry = storedSessions.find((session) => session.id === storedId);
      if (entry?.messages?.length) {
        setMessages(normalizeMessages(entry.messages));
      }
      setAdventureLoading(false);
      introRequestRef.current = { key: introKey, inFlight: false };
      return;
    }
    setAdventureLoading(true);
    const intro = await getIntro(internalCharacter?.name, internalCharacter?.klass);
    setTimeout(() => {
      setMessages([makeMessage("assistant", intro)]);
      setRulesSeeded(true);
      setAdventureLoading(false);
      introRequestRef.current = { key: introKey, inFlight: false };
    }, 900);
  }, [characterEntry, getIntro, makeMessage, normalizeMessages, messages.length, internalCharacter]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!rulesSeeded && messages.length) {
      setRulesSeeded(true);
    }
  }, [messages, rulesSeeded]);

  useEffect(() => {
    if (characterEntry) {
      suppressColdStartRef.current = false;
    }
  }, [characterEntry]);

  useEffect(() => {
    if (!adventureLoading && !loading) return;
    const interval = setInterval(() => {
      setLoadingFlavorIndex((prev) => (prev + 1) % LOADING_FLAVOR.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [adventureLoading, loading]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = event.endCoordinates?.height || 260;
      setKeyboardOpen(true);
      Animated.timing(keyboardTranslate, {
        toValue: -height,
        duration: Platform.OS === "android" ? 120 : 180,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      Animated.timing(keyboardTranslate, {
        toValue: 0,
        duration: Platform.OS === "android" ? 120 : 180,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardTranslate]);

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
      setEnemyCatalog(bestiarySource || {});
      if (!pcId && pcList[0]) setPcId(pcList[0].id);
      if (!enemyId && enemyList[0]) setEnemyId(enemyList[0].id);
    } catch (error) {
      console.error("Failed to load combat catalogs", error);
    }
  }, [serverUrl, pcId, enemyId]);

  useEffect(() => {
    loadCombatCatalogs();
  }, [loadCombatCatalogs]);

  useEffect(() => {
    if (internalCharacter?.id) {
      setPcId(internalCharacter.id);
      setRulesSessionId(null);
    }
  }, [internalCharacter]);

  const createRulesSession = useCallback(
    async (announce = false, overrideEnemyId = null) => {
      const activeEnemyId = overrideEnemyId || enemyId;
      if (!pcId || !activeEnemyId) {
        throw new Error("Select a combatant first.");
      }
      const storySessionId = await ensureSession();
      const response = await apiPost(serverUrl, "/api/rules/sessions", {
        pc_id: pcId,
        enemy_id: activeEnemyId,
        story_session_id: storySessionId,
      });
      setRulesSessionId(response.session_id);
      if (overrideEnemyId) {
        setEnemyId(activeEnemyId);
      }
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
          makeMessage(
            "assistant",
            `Combat starts: ${response.pc?.name} vs ${response.enemy?.name}.`
          ),
        ]);
      }
      return response.session_id;
    },
    [serverUrl, pcId, enemyId, makeMessage, ensureSession]
  );

  const ensureRulesSession = useCallback(
    async (announce = false, overrideEnemyId = null) => {
      if (rulesSessionId) return rulesSessionId;
      return createRulesSession(announce, overrideEnemyId);
    },
    [rulesSessionId, createRulesSession]
  );

  const handleEncounterStart = useCallback(
    async (encounter) => {
      if (!encounter) return;
      if (rulesSessionId) {
        setDrawerExpanded(true);
        return;
      }
      const resolvedEnemyId = resolveEncounterEnemyId(encounter);
      try {
        await createRulesSession(true, resolvedEnemyId);
        setDrawerExpanded(true);
        setPlayerTurn(true);
      } catch (error) {
        console.error("Failed to start encounter", error);
      }
    },
    [rulesSessionId, resolveEncounterEnemyId, createRulesSession]
  );

  const startCombat = useCallback(async () => {
    if (!pcId || !enemyId) return;
    setCombatBusy(true);
    try {
      const roll = Math.floor(Math.random() * 20) + 1;
      const actionText = `Initiative roll: ${roll}.`;
      setMessages((prev) => [...prev, makeMessage("assistant", actionText)]);
      await ensureRulesSession(true);
      sendActionMessage(actionText);
    } catch (error) {
      console.error("Failed to start combat", error);
    } finally {
      setCombatBusy(false);
    }
  }, [ensureRulesSession, pcId, enemyId, makeMessage, sendActionMessage]);

  const runAttack = useCallback(async () => {
    setCombatBusy(true);
    try {
      let id = rulesSessionId;
      if (!id) {
        id = await ensureRulesSession(true);
      }
      const narrate = shouldNarrate();
      const response = await apiPost(
        serverUrl,
        `/api/rules/sessions/${id}/attack${narrate ? "?narrate=true" : ""}`,
        { weapon_id: weaponId || undefined }
      );
      const attackerName = response?.attacker_name || "You";
      const summary = `${attackerName} attacks: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, makeMessage("assistant", summary)]);
      if (response?.narration) {
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", response.narration),
        ]);
      }
      setPlayerTurn(false);
    } catch (error) {
      console.error("Attack failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId, weaponId, shouldNarrate, makeMessage, ensureRulesSession]);

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
      const attackerName = response?.attacker_name || "Enemy";
      const summary = `${attackerName} strikes: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type}.`;
      setMessages((prev) => [...prev, makeMessage("assistant", summary)]);
      if (response?.narration) {
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", response.narration),
        ]);
      }
      setCheckUsed(false);
      setPlayerTurn(true);
    } catch (error) {
      console.error("Enemy turn failed", error);
    } finally {
      setCombatBusy(false);
    }
  }, [serverUrl, rulesSessionId, shouldNarrate, makeMessage, playerTurn]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    const payloadMessage = trimmed || resendMessage;
    if (!payloadMessage || loading) return;
    const isContinueCommand = payloadMessage.trim().toLowerCase() === "/continue";
    setLoading(true);
    setInput("");
    setResendReady(false);
    setResendMessage("");
    if (isContinueCommand) {
      setMessages((prev) => [...prev, makeMessage("user", "/continue")]);
    } else {
      setMessages((prev) => [...prev, makeMessage("user", payloadMessage)]);
    }
    let id = null;
    try {
      id = await ensureSession();

      if (!isContinueCommand) {
        // STREAMING IMPLEMENTATION
        // Add placeholder for AI response
        setMessages((prev) => [...prev, makeMessage("assistant", "...")]);

        let currentContent = "";

        apiStream(serverUrl, `/api/sessions/${id}/stream`, {
          message: payloadMessage,
          fast: isRemoteServer ? true : undefined,
        }, {
          onMessage: (delta) => {
            currentContent += delta;
            setMessages((prev) => {
              const list = [...prev];
              const lastIdx = list.findIndex((_, i) => i === list.length - 1);
              if (lastIdx === -1) return prev;
              const last = list[lastIdx];
              if (last.role === "assistant") {
                // Replace the entire last message content
                // Handle "..." placeholder case
                if (last.content === "..." && currentContent) {
                  list[lastIdx] = { ...last, content: currentContent };
                } else {
                  list[lastIdx] = { ...last, content: currentContent };
                }
                return list;
              }
              return prev;
            });
          },
          onFinish: async () => {
            setLoading(false);
            // Refresh credits
            try {
              const me = await apiGet(serverUrl, "/api/me");
              if (me.credits && onCreditsUpdate) onCreditsUpdate(me.credits);
            } catch (e) { /* ignore */ }
          },
          onError: (err) => {
            console.warn("Stream error", err);
            setLoading(false);
            setResendReady(true);
            setResendMessage(payloadMessage);
          }
        });
        return;
      }

      // Legacy/Continue Handling
      const response = await withHealthGuard(() => {
        if (isContinueCommand) {
          return apiPost(serverUrl, `/api/sessions/${id}/continue`, {
            fast: isRemoteServer ? true : undefined,
          });
        }
        // Fallback or unreachable
        return apiPost(serverUrl, `/api/sessions/${id}/messages`, {
          message: payloadMessage,
          fast: isRemoteServer ? true : undefined,
        });
      });
      appendAssistantResponse(response);
      if (response?.credits && onCreditsUpdate) {
        onCreditsUpdate(response.credits);
      }
    } catch (error) {
      const errorMessage = error?.message || "Request failed.";
      const canCheck = shouldCheckStatus(errorMessage) && id;
      if (canCheck) {
        try {
          const serverReply = await pollSessionReply(id);
          if (serverReply) {
            setMessages((prev) => {
              const lastAssistant = [...prev].reverse().find((msg) => msg.role === "assistant");
              if (lastAssistant?.content === serverReply) return prev;
              return [...prev, makeMessage("assistant", serverReply)];
            });
            return;
          }
          setMessages((prev) => [
            ...prev,
            makeMessage("assistant", "GM is still thinking. Check again in a moment."),
          ]);
          if (!status?.pending_reply) {
            setResendReady(true);
            setResendMessage(payloadMessage);
          }
          return;
        } catch (statusError) {
          // fall through to default error message
        }
      }
      const briefError =
        errorMessage.length < 300 ? errorMessage : "Request failed. Try again.";
      setMessages((prev) => [...prev, makeMessage("assistant", briefError)]);
      setResendReady(true);
      setResendMessage(payloadMessage);

      // Handle Unauthorized (401/403)
      if (error?.status === 401 || error?.status === 403) {
        if (onUnauthorized) onUnauthorized();
      }
    } finally {
      if (isContinueCommand || !id) {
        setLoading(false);
      }
      // For streaming, loading is cleared in onFinish/onError
    }
  }, [
    input,
    loading,
    resendMessage,
    isRemoteServer,
    appendAssistantResponse,
    ensureSession,
    serverUrl,
    onCreditsUpdate,
    withHealthGuard,
    makeMessage,
    shouldCheckStatus,
    pollSessionReply,
  ]);

  const sendActionMessage = useCallback(
    async (actionText) => {
      if (!actionText) return;
      setLoading(true);
      setCombatBusy(true);
      let id = null;
      try {
        id = await ensureSession();
        const response = await apiPost(serverUrl, `/api/sessions/${id}/messages`, {
          message: actionText,
          fast: isRemoteServer ? true : undefined,
        });
        appendAssistantResponse(response);
        if (response?.credits && onCreditsUpdate) {
          onCreditsUpdate(response.credits);
        }
      } catch (error) {
        const errorMessage = error?.message || "Request failed.";
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", errorMessage.length < 200 ? errorMessage : "Request failed."),
        ]);
      } finally {
        setLoading(false);
        setCombatBusy(false);
      }
    },
    [appendAssistantResponse, ensureSession, serverUrl, onCreditsUpdate, isRemoteServer, makeMessage]
  );

  const listRef = useRef(null);
  const data = useMemo(
    () => messages.map((msg) => ({ id: msg.id ?? makeId(), ...msg })),
    [messages, makeId]
  );

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  useEffect(() => {
    storyCache.messages = messages;
  }, [messages]);

  useEffect(() => {
    storyCache.sessionId = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!resetSessionToken) return;
    suppressColdStartRef.current = true;
    sessionInvalidRef.current = true;
    sessionRequestRef.current = null;
    setSessionId(null);
    setMessages([]);
    setRulesSeeded(false);
    setAdventureLoading(false);
    setRulesSessionId(null);
    setCheckResult(null);
    setCheckUsed(false);
    setDrawerExpanded(false);
    introRequestRef.current = { key: null, inFlight: false };
    storyCache.messages = [];
    storyCache.sessionId = null;
    storyCache.introKey = null;
    removeItem(STORAGE_KEYS.lastSession);
  }, [resetSessionToken]);

  useEffect(() => {
    if (!sessionId || !messages.length) return;
    const persist = async () => {
      const storedSessions = await getJson(STORAGE_KEYS.sessions, []);
      const character = internalCharacter
        ? {
          name: internalCharacter.name || "Adventurer",
          klass: internalCharacter.klass || "Hero",
          level: Number(internalCharacter.level) || 1,
        }
        : null;
      const entry = {
        id: sessionId,
        title: buildSessionTitle(messages),
        preview: buildSessionPreview(messages),
        updatedAt: Date.now(),
        character,
        messages,
      };

      const existingIndex = storedSessions.findIndex((session) => session.id === sessionId);
      let next;
      if (existingIndex !== -1) {
        next = [...storedSessions];
        next[existingIndex] = entry;
      } else {
        next = [entry, ...storedSessions];
      }

      await setJson(STORAGE_KEYS.sessions, next.slice(0, 20));
    };
    persist();
  }, [sessionId, messages, buildSessionTitle, buildSessionPreview, internalCharacter]);

  useEffect(() => {
    if (!sessionEntry) return;
    const entryMessages = sessionEntry.messages || [];
    if (sessionEntry.id) {
      setSessionId(sessionEntry.id);
      setJson(STORAGE_KEYS.lastSession, sessionEntry.id);
    }
    if (sessionEntry.character) {
      setInternalCharacter(sessionEntry.character);
    }
    if (entryMessages.length) {
      setMessages(normalizeMessages(entryMessages));
      setRulesSeeded(true);
      setAdventureLoading(false);
    }
    onSessionEntryHandled?.();
  }, [sessionEntry, onSessionEntryHandled, normalizeMessages]);

  useEffect(() => {
    ensureSessionRef.current = ensureSession;
  }, [ensureSession]);

  useEffect(() => {
    fetchSessionIntroRef.current = fetchSessionIntro;
  }, [fetchSessionIntro]);

  useEffect(() => {
    makeMessageRef.current = makeMessage;
  }, [makeMessage]);

  useEffect(() => {
    onCharacterEntryHandledRef.current = onCharacterEntryHandled;
  }, [onCharacterEntryHandled]);

  useEffect(() => {
    if (!characterEntry) return;
    if (introRequestRef.current.inFlight) {
      return;
    }
    const name = characterEntry.name || "Adventurer";
    const klass = characterEntry.klass || "Hero";
    const introKey = characterEntry.requestId || `${name}|${klass}`;
    if (storyCache.introKey === introKey) {
      return;
    }
    if (introRequestRef.current.key === introKey) {
      return;
    }
    introRequestRef.current = { key: introKey, inFlight: true };
    storyCache.introKey = introKey;
    setAdventureLoading(true);
    let isActive = true;
    let fallbackTimer = null;
    const runIntro = async () => {
      const localIntro = pickFallbackIntro() || pickIntro();
      let introApplied = false;
      const applyIntro = (text) => {
        if (introApplied || !isActive) return;
        introApplied = true;
        const buildMessage = makeMessageRef.current || makeMessage;
        setMessages((prev) => [...prev, buildMessage("assistant", text)]);
        setAdventureLoading(false);
        onCharacterEntryHandledRef.current?.();
      };
      fallbackTimer = setTimeout(() => {
        applyIntro(localIntro);
        introRequestRef.current = { key: introKey, inFlight: false };
      }, 5000);
      if (!isActive) return;
      setTimeout(() => applyIntro(localIntro), 300);

      let serverIntro = null;
      try {
        const ensureSessionFn = ensureSessionRef.current || ensureSession;
        const fetchSessionIntroFn = fetchSessionIntroRef.current || fetchSessionIntro;
        const id = await ensureSessionFn();
        serverIntro = await fetchSessionIntroFn(id, characterEntry);
      } catch (error) {
        serverIntro = null;
      }
      if (!isActive) return;
      if (serverIntro && serverIntro !== localIntro) {
        const buildMessage = makeMessageRef.current || makeMessage;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last?.content === localIntro) {
            return [...prev.slice(0, -1), buildMessage("assistant", serverIntro)];
          }
          return [...prev, buildMessage("assistant", serverIntro)];
        });
      }
      introRequestRef.current = { key: introKey, inFlight: false };
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
    runIntro();
    return () => {
      isActive = false;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      setAdventureLoading(false);
      introRequestRef.current = { key: introKey, inFlight: false };
    };
  }, [characterEntry]);

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
        makeMessage("assistant", "Only one check per turn."),
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
        makeMessage("assistant", `${label} = ${response?.total ?? "-"}`),
      ]);
      if (response?.narration) {
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", response.narration),
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
    makeMessage,
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
  const handleCheckModeSelect = useCallback(
    (modeId) => {
      if (
        modeId === "save" &&
        saveOptions.length === 1 &&
        !checkBusy &&
        !checkUsed
      ) {
        handleSaveCheck(saveOptions[0]);
        return;
      }
      setCheckMode(modeId);
    },
    [saveOptions, checkBusy, checkUsed, handleSaveCheck]
  );
  const toggleDrawer = useCallback(() => {
    setDrawerExpanded((prev) => !prev);
  }, []);

  const handleWeaponSelect = useCallback((id) => {
    setWeaponId(id);
    setMessages((prev) => [
      ...prev,
      makeMessage("assistant", `Equipped ${id}.`),
    ]);
  }, [makeMessage]);

  const handleSpellCast = useCallback(
    async (spellName) => {
      if (!spellName) return;
      const spellId = spellCatalogMap[normalizeSpellKey(spellName)] || spellName;
      const actionText = `Cast ${spellName}.`;
      let storyActionText = actionText;
      setMessages((prev) => [...prev, makeMessage("user", actionText)]);
      setShowSpellMenu(false);
      if (!rulesSessionId) {
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", "You can only cast spells in combat."),
        ]);
        return;
      }
      setPlayerTurn(false);
      setCombatBusy(true);
      try {
        const id = await ensureRulesSession(true);
        const narrate = shouldNarrate();
        const response = await apiPost(
          serverUrl,
          `/api/rules/sessions/${id}/cast${narrate ? "?narrate=true" : ""}`,
          { spell_id: spellId }
        );
        const spellLabel = response?.name || spellName;
        let summary = `${spellLabel} cast.`;
        if (response?.attack_total !== null && response?.attack_total !== undefined) {
          summary = `${spellLabel} ${response.hit ? "hits" : "misses"}: ${response.attack_total} to hit.`;
          if (response.damage_total) {
            summary = `${spellLabel} ${response.hit ? "hits" : "misses"}: ${response.attack_total} to hit for ${response.damage_total} ${response.damage_type || "magic"}.`;
          }
        } else if (response?.save) {
          summary = `${spellLabel} forces a ${response.save.toUpperCase()} save (${response.attack_total ?? "-"} vs DC ${response.dc ?? "-"}).`;
          if (response.damage_total) {
            summary += ` Deals ${response.damage_total} ${response.damage_type || "magic"} damage.`;
          }
        } else if (response?.damage_total) {
          summary = `${spellLabel} hits for ${response.damage_total} ${response.damage_type || "magic"} damage.`;
        }
        storyActionText = summary;
        setMessages((prev) => [...prev, makeMessage("assistant", summary)]);
        if (response?.narration) {
          setMessages((prev) => [
            ...prev,
            makeMessage("assistant", response.narration),
          ]);
        }
      } catch (error) {
        console.error("Spell cast failed", error);
      } finally {
        setCombatBusy(false);
      }
      sendActionMessage(storyActionText);
    },
    [
      makeMessage,
      sendActionMessage,
      ensureRulesSession,
      serverUrl,
      shouldNarrate,
      spellCatalogMap,
      normalizeSpellKey,
      rulesSessionId,
    ]
  );

  const loadClassSpells = useCallback(async () => {
    const klass = internalCharacter?.klass;
    if (!klass) return;
    setSpellMenuLoading(true);
    try {
      const data = await apiGet(serverUrl, "/api/rules/spells");
      const fallback =
        data && Object.keys(data).length
          ? data
          : DEFAULT_SPELLS.reduce((acc, entry) => {
            acc[entry.id] = entry;
            return acc;
          }, {});
      const nameMap = {};
      Object.entries(fallback).forEach(([id, payload]) => {
        const name = payload.name;
        if (name) {
          nameMap[normalizeSpellKey(name)] = id;
        }
      });
      if (Object.keys(nameMap).length) {
        setSpellCatalogMap(nameMap);
      }
      const list = Object.values(fallback).map((payload) => ({
        name: payload.name,
        classes: normalizeSpellClasses(payload.classes),
      }));
      const target = String(klass).toLowerCase().trim();
      const filtered = list
        .filter((spell) =>
          spell.classes?.some((cls) => String(cls).toLowerCase().trim() === target)
        )
        .map((spell) => spell.name)
        .filter(Boolean);
      setSpellMenuOptions([...new Set(filtered)]);
      if (!filtered.length) {
        setMessages((prev) => [
          ...prev,
          makeMessage(
            "assistant",
            `No spells found for class ${klass}.`
          ),
        ]);
      }
    } catch (error) {
      // ignore load failure
    } finally {
      setSpellMenuLoading(false);
    }
  }, [internalCharacter, serverUrl, normalizeSpellClasses, normalizeSpellKey]);

  useEffect(() => {
    if (!showSpellMenu) return;
    if (spellOptions.length) return;
    if (spellMenuOptions.length) return;
    loadClassSpells();
  }, [showSpellMenu, spellOptions.length, spellMenuOptions.length, loadClassSpells]);

  const handleInventory = useCallback(() => {
    setInventoryOpen((prev) => !prev);
  }, []);

  const handleUseItem = useCallback(() => {
    const itemText = inventoryInput.trim();
    if (!itemText) return;
    const actionText = `Use ${itemText}.`;
    setMessages((prev) => [...prev, makeMessage("user", actionText)]);
    sendActionMessage(actionText);
    setInventoryInput("");
    setInventoryOpen(false);
    setPlayerTurn(false);
  }, [inventoryInput, makeMessage, sendActionMessage]);

  useEffect(() => {
    if (rulesSessionId) {
      setDrawerExpanded(true);
    }
  }, [rulesSessionId]);

  useEffect(() => {
    setCheckUsed(false);
  }, [rulesSessionId]);

  useEffect(() => {
    if (!rulesSessionId) {
      setPlayerTurn(true);
    }
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

  const drawerLabel = drawerExpanded
    ? "Minimise"
    : rulesSessionId
      ? "Combat controls"
      : "Combat drawer";

  return (
    <View style={styles.root}>
      <View style={styles.chatArea}>
        <DispositionMeter score={attraction} label="Attraction" />
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user"
                  ? styles.userBubble
                  : item.role === "system"
                    ? styles.systemBubble
                    : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user"
                    ? styles.userText
                    : item.role === "system"
                      ? styles.systemText
                      : styles.aiText,
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
        {(loading || combatBusy || checkBusy) && !adventureLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingLabel}>
              The GM is {LOADING_FLAVOR[loadingFlavorIndex]}...
            </Text>
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
      <Animated.View
        style={[
          styles.inputArea,
          {
            transform: [{ translateY: keyboardTranslate }],
            bottom: keyboardOpen
              ? spacing.xs
              : DRAWER_COLLAPSED_HEIGHT +
              (drawerExpanded ? DRAWER_CONTENT_HEIGHT : 0) +
              spacing.xs,
          },
        ]}
      >
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe your move..."
          placeholderTextColor={colors.mutedGold}
        />
        <Button
          label={loading ? "..." : resendReady ? "Resend" : "Send"}
          onPress={sendMessage}
          disabled={(!input.trim() && !resendReady) || loading}
        />
      </Animated.View>
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
            <View style={styles.drawerButtonRow}>
              {rulesSessionId && playerTurn ? (
                <Button
                  label="Attack"
                  onPress={runAttack}
                  disabled={combatBusy}
                />
              ) : null}
              <Button
                label="Enemy Turn"
                onPress={runEnemyTurn}
                disabled={combatBusy || !rulesSessionId || playerTurn}
                variant={playerTurn ? "ghost" : "primary"}
              />
              <Button
                label="Spells"
                onPress={() => setShowSpellMenu((prev) => !prev)}
                variant="ghost"
              />
            </View>
            <View style={styles.drawerButtonRow}>
              <Button
                label="Inventory"
                onPress={handleInventory}
                variant="ghost"
                style={styles.halfButton}
              />
            </View>
            {inventoryOpen ? (
              <View style={styles.inventoryRow}>
                <TextInput
                  style={[styles.drawerInput, styles.inventoryInput]}
                  value={inventoryInput}
                  onChangeText={setInventoryInput}
                  placeholder="Use item..."
                  placeholderTextColor={colors.mutedGold}
                />
                <Button
                  label="Use Item"
                  onPress={handleUseItem}
                  style={styles.inventoryButton}
                  disabled={combatBusy || !inventoryInput.trim()}
                />
              </View>
            ) : null}
            {inventoryOpen && inventoryItems.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weaponRow}
              >
                {inventoryItems.map((item) => (
                  <Button
                    key={item}
                    label={item}
                    onPress={() => setInventoryInput(item)}
                    variant="ghost"
                    style={styles.weaponButton}
                  />
                ))}
              </ScrollView>
            ) : null}
            {showSpellMenu ? (
              combinedSpellOptions.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weaponRow}
                >
                  {combinedSpellOptions.map((spell) => (
                    <Button
                      key={spell}
                      label={spell}
                      onPress={() => handleSpellCast(spell)}
                      variant="ghost"
                      style={styles.weaponButton}
                      disabled={combatBusy}
                    />
                  ))}
                </ScrollView>
              ) : spellMenuLoading ? (
                <Text style={styles.muted}>Loading spells...</Text>
              ) : (
                <Text style={styles.muted}>No spells available.</Text>
              )
            ) : null}
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
                    onPress={() => handleCheckModeSelect(modeOption.id)}
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
    paddingTop: theme.spacing.lg,
    alignItems: 'center',
  },
  chatArea: {
    flex: 1,
    width: "100%",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 100, // Space for input area
  },
  inputArea: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.goldDim,
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: Platform.OS === 'ios' ? 24 : 12, // Adjusted for safe area?
    zIndex: 10,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: theme.layout.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 120, // More space for input
    gap: theme.spacing.md,
  },
  bubble: {
    padding: theme.spacing.md,
    borderRadius: theme.layout.radius.md,
    borderWidth: 1,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: 'rgba(197, 160, 89, 0.1)',
    borderColor: theme.colors.goldDim,
    borderBottomRightRadius: 2,
  },
  systemBubble: {
    alignSelf: "center",
    backgroundColor: 'rgba(138, 28, 28, 0.2)', // Crimson tint
    borderColor: theme.colors.crimson,
    width: '90%',
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: 'rgba(18, 18, 20, 0.8)', // Dark panel
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textPrimary,
  },
  userText: {
    color: theme.colors.gold,
  },
  systemText: {
    color: theme.colors.crimsonBright,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: theme.fonts.header,
  },
  aiText: {
    color: theme.colors.textPrimary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: theme.spacing.sm,
    borderRadius: theme.layout.radius.pill,
    marginHorizontal: '20%',
  },
  loadingLabel: {
    color: theme.colors.gold,
    marginTop: theme.spacing.xs,
    fontFamily: theme.fonts.body,
    fontSize: 12,
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: DRAWER_EXPANDED_HEIGHT,
    zIndex: 20,
    elevation: 20,
  },
  drawerHandle: {
    height: DRAWER_COLLAPSED_HEIGHT,
    backgroundColor: theme.colors.surfaceAlt,
    borderTopLeftRadius: theme.layout.radius.lg,
    borderTopRightRadius: theme.layout.radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.gold,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    shadowColor: theme.colors.gold,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  drawerHandleLabel: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.header,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 14,
    fontWeight: "bold",
  },
  drawerHandleBadge: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: theme.fonts.body,
  },
  drawerContentWrapper: {
    height: DRAWER_CONTENT_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  drawerButtonRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  halfButton: {
    flex: 1,
  },
  inventoryRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  drawerInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.body,
  },
  inventoryButton: {
    width: 100,
  },
  weaponRow: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  weaponButton: {
    minWidth: 100,
  },
  checkSection: {
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  checkSectionTitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.header,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pill: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.layout.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    overflow: 'hidden',
  },
  checkModePill: {
    // default state
  },
  pillActive: {
    backgroundColor: theme.colors.goldDim,
    borderColor: theme.colors.gold,
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  },
  muted: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontStyle: 'italic',
    fontSize: 12,
  },
  checkResult: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: theme.layout.radius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  checkResultText: {
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
