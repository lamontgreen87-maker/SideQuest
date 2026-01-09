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
import { apiGet, apiPost } from "../api/client";
import { INTRO_PROMPTS, STORAGE_KEYS } from "../config";
import { getJson, removeItem, setJson } from "../storage";
import { colors, radius, spacing } from "../theme";
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

function pickIntro() {
  const index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

function pickFallbackIntro() {
  const index = Math.floor(Math.random() * INTRO_FALLBACKS.length);
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
  const [sessionId, setSessionId] = useState(storyCache.sessionId);
  const [messages, setMessages] = useState(
    storyCache.messages.length ? normalizeMessages(storyCache.messages) : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendReady, setResendReady] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
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
    const source = currentCharacter || {};
    const combined = [
      ...(source.prepared_spells || []),
      ...(source.known_spells || []),
      ...(source.spellbook || []),
    ];
    const unique = [...new Set(combined.map((entry) => String(entry).trim()).filter(Boolean))];
    return unique;
  }, [currentCharacter]);
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
          handleEncounterStart(encounter);
        }
      };
      const nextInventory = response?.game_state?.inventory;
      if (Array.isArray(nextInventory)) {
        setInventoryItems(nextInventory);
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
    const intro = await getIntro();
    setTimeout(() => {
      setMessages([makeMessage("assistant", intro)]);
      setRulesSeeded(true);
      setAdventureLoading(false);
      introRequestRef.current = { key: introKey, inFlight: false };
    }, 900);
  }, [characterEntry, getIntro, makeMessage, normalizeMessages, messages.length]);

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
    if (currentCharacter?.id) {
      setPcId(currentCharacter.id);
      setRulesSessionId(null);
    }
  }, [currentCharacter]);

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
      const response = await withHealthGuard(() => {
        if (isContinueCommand) {
          return apiPost(serverUrl, `/api/sessions/${id}/continue`, {
            fast: isRemoteServer ? true : undefined,
          });
        }
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
    } finally {
      setLoading(false);
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
    () => messages.map((msg, index) => ({ id: msg.id ?? `${index}`, ...msg })),
    [messages]
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
        const character = currentCharacter
          ? {
              name: currentCharacter.name || "Adventurer",
              klass: currentCharacter.klass || "Hero",
              level: Number(currentCharacter.level) || 1,
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
        const next = [
          entry,
        ...storedSessions.filter((session) => session.id !== sessionId),
      ].slice(0, 20);
      await setJson(STORAGE_KEYS.sessions, next);
    };
    persist();
    }, [sessionId, messages, buildSessionTitle, buildSessionPreview, currentCharacter]);

  useEffect(() => {
    if (!sessionEntry) return;
    const entryMessages = sessionEntry.messages || [];
    if (sessionEntry.id) {
      setSessionId(sessionEntry.id);
      setJson(STORAGE_KEYS.lastSession, sessionEntry.id);
    }
    if (entryMessages.length) {
      setMessages(normalizeMessages(entryMessages));
      setRulesSeeded(true);
      setAdventureLoading(false);
    }
    onSessionEntryHandled?.();
  }, [sessionEntry, onSessionEntryHandled]);

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
    const runIntro = async () => {
      const localIntro = pickFallbackIntro() || pickIntro();
      if (!isActive) return;
      setTimeout(() => {
        if (!isActive) return;
        setMessages((prev) => [...prev, makeMessage("assistant", localIntro)]);
        setAdventureLoading(false);
        onCharacterEntryHandled?.();
      }, 300);

      let serverIntro = null;
      try {
        const id = await ensureSession();
        serverIntro = await fetchSessionIntro(id, characterEntry);
      } catch (error) {
        serverIntro = null;
      }
      if (!isActive) return;
      if (serverIntro && serverIntro !== localIntro) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last?.content === localIntro) {
            return [...prev.slice(0, -1), makeMessage("assistant", serverIntro)];
          }
          return [...prev, makeMessage("assistant", serverIntro)];
        });
      }
      introRequestRef.current = { key: introKey, inFlight: false };
    };
    runIntro();
    return () => {
      isActive = false;
    };
  }, [
    characterEntry,
    onCharacterEntryHandled,
    makeMessage,
    ensureSession,
    fetchSessionIntro,
  ]);

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
          summary = `${spellLabel} forces a ${response.save.toUpperCase()} save (${response.attack_total ?? "-" } vs DC ${response.dc ?? "-" }).`;
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
    ]
  );

  const loadClassSpells = useCallback(async () => {
    const klass = currentCharacter?.klass;
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
  }, [currentCharacter, serverUrl, normalizeSpellClasses, normalizeSpellKey]);

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
        <FlatList
          ref={listRef}
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
    minHeight: 0,
    paddingTop: spacing.lg,
    paddingHorizontal: 0,
    paddingBottom: DRAWER_COLLAPSED_HEIGHT + spacing.lg,
    width: "100%",
    position: "relative",
  },
  chatArea: {
    flex: 1,
    minHeight: 360,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    paddingBottom: spacing.lg + 72,
    width: "100%",
    position: "relative",
    zIndex: 1,
  },
  inputArea: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.panelAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: DRAWER_COLLAPSED_HEIGHT + spacing.xs - 24,
    zIndex: 5,
    elevation: 5,
    width: "100%",
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    justifyContent: "flex-start",
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
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    overflow: "hidden",
    height: DRAWER_COLLAPSED_HEIGHT + DRAWER_CONTENT_HEIGHT,
    zIndex: 2,
    minHeight: DRAWER_COLLAPSED_HEIGHT,
  },
  drawerHandle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    height: DRAWER_COLLAPSED_HEIGHT,
  },
  drawerHandleLabel: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  drawerHandleBadge: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  drawerContentWrapper: {
    flex: 1,
  },
  drawerScroll: {
    maxHeight: DRAWER_CONTENT_HEIGHT,
    width: "100%",
  },
  drawerScrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  selectorRow: {
    gap: spacing.sm,
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
  drawerButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  weaponRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  weaponButton: {
    flex: 1,
    minWidth: 120,
  },
  halfButton: {
    flex: 1,
  },
  checkSection: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.sm,
  },
  checkSectionTitle: {
    color: colors.parchment,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  drawerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.parchment,
    backgroundColor: colors.panelAlt,
  },
  inventoryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  inventoryInput: {
    flex: 1,
  },
  inventoryButton: {
    minWidth: 120,
  },
  checkModePill: {
    borderColor: colors.gold,
  },
  checkResult: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.panelAlt,
  },
  checkResultText: {
    color: colors.parchment,
    fontSize: 12,
  },
  muted: {
    color: colors.mutedGold,
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
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
