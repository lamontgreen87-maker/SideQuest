import React from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { theme } from "../theme";
import Button from "../components/Button";
import { FantasyCard } from "../components/FantasyCard";

export default function SessionsScreen({
    visible,
    onClose,
    sessions = [],
    loading = false,
    onResume,
}) {
    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>My Campaigns</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.list}>
                        {loading ? (
                            <Text style={styles.emptyText}>Loading campaigns...</Text>
                        ) : sessions.length === 0 ? (
                            <Text style={styles.emptyText}>No active campaigns found.</Text>
                        ) : (
                            sessions.map((session) => (
                                <FantasyCard key={session.session_id} style={styles.card} variant="standard">
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardTitle}>
                                            {session.character_name || "Unknown Hero"}
                                        </Text>
                                        <Text style={styles.cardSubtitle}>
                                            Lvl {session.character_level || 1} {session.character_class || "Adventurer"}
                                        </Text>
                                    </View>
                                    <Text style={styles.cardDate}>
                                        {new Date(session.created_at).toLocaleDateString()}
                                    </Text>
                                    {session.summary ? (
                                        <Text style={styles.cardSummary} numberOfLines={3}>
                                            {session.summary}
                                        </Text>
                                    ) : null}
                                    <Button
                                        label="Resume"
                                        onPress={() => onResume(session.session_id)}
                                        variant="primary"
                                        style={styles.resumeButton}
                                    />
                                </FantasyCard>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.85)",
        justifyContent: "center",
        padding: theme.spacing.md,
    },
    container: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.layout.radius.lg,
        maxHeight: "80%",
        borderWidth: 1,
        borderColor: theme.colors.goldDim,
        padding: theme.spacing.lg,
        shadowColor: theme.colors.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingBottom: theme.spacing.sm,
    },
    title: {
        fontSize: 24,
        color: theme.colors.gold,
        fontFamily: theme.fonts.header,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    closeButton: {
        padding: theme.spacing.sm,
    },
    closeButtonText: {
        color: theme.colors.textMuted,
        fontSize: 24,
    },
    list: {
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        textAlign: "center",
        opacity: 0.7,
        marginTop: theme.spacing.xl,
        fontFamily: theme.fonts.body,
    },
    card: {
        padding: theme.spacing.md,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: theme.spacing.xs,
    },
    cardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: "bold",
        fontFamily: theme.fonts.header,
    },
    cardSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.body,
    },
    cardDate: {
        color: theme.colors.textMuted,
        fontSize: 12,
        marginBottom: theme.spacing.sm,
        opacity: 0.7,
        fontFamily: theme.fonts.body,
    },
    cardSummary: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: theme.spacing.md,
        lineHeight: 20,
        opacity: 0.9,
        fontFamily: theme.fonts.body,
        fontStyle: 'italic',
    },
    resumeButton: {
        marginTop: theme.spacing.xs,
    },
});
