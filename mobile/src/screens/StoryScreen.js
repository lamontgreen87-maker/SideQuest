import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../components/Button";
import { apiPost } from "../api/client";
import { INTRO_PROMPTS, STORAGE_KEYS } from "../config";
import { getJson, setItem, setJson } from "../storage";
import { colors, radius, spacing } from "../theme";

function pickIntro() {
  const index = Math.floor(Math.random() * INTRO_PROMPTS.length);
  return INTRO_PROMPTS[index] || INTRO_PROMPTS[0];
}

export default function StoryScreen({ serverUrl, onCreditsUpdate }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  const loadSession = useCallback(async () => {
    const storedId = await getJson(STORAGE_KEYS.lastSession, null);
    if (storedId) {
      setSessionId(storedId);
      return;
    }
    const intro = pickIntro();
    setMessages([{ role: "assistant", content: intro }]);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const ensureSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }
    const response = await apiPost(serverUrl, "/api/sessions", {
      messages: messages.length ? messages : undefined,
    });
    setSessionId(response.session_id);
    await setJson(STORAGE_KEYS.lastSession, response.session_id);
    return response.session_id;
  }, [messages, serverUrl, sessionId]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setInput("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    try {
      const id = await ensureSession();
      const response = await apiPost(serverUrl, `/api/sessions/${id}/messages`, {
        message: trimmed,
        fast: fastMode,
      });
      if (response?.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.response },
        ]);
      }
      if (response?.credits && onCreditsUpdate) {
        onCreditsUpdate(response.credits);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Stream failed. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, ensureSession, serverUrl, fastMode, onCreditsUpdate]);

  const data = useMemo(
    () => messages.map((msg, index) => ({ id: `${index}`, ...msg })),
    [messages]
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button
          label={fastMode ? "Fast On" : "Fast Off"}
          variant="ghost"
          onPress={() => setFastMode((prev) => !prev)}
        />
      </View>
      <FlatList
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
        contentContainerStyle={styles.list}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe your move..."
          placeholderTextColor={colors.mutedGold}
        />
        <Button
          label={loading ? "..." : "Send"}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.sm,
  },
  list: {
    paddingBottom: spacing.lg,
    gap: spacing.sm,
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
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
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
});
