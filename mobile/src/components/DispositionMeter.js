import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

export const DispositionMeter = ({ score = 50, label = "Neutral", color = theme.colors.gold }) => {
    // Clamp score 0-100
    const clampedScore = Math.max(0, Math.min(100, score));
    const widthPercent = `${clampedScore}%`;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{clampedScore}/100</Text>
            </View>
            <View style={styles.track}>
                <LinearGradient
                    colors={[color, theme.colors.goldDim]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.fill, { width: widthPercent }]}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: theme.spacing.sm,
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xs,
    },
    label: {
        ...theme.typography.caption,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    value: {
        ...theme.typography.caption,
        color: theme.colors.textPrimary,
        fontWeight: 'bold',
    },
    track: {
        height: 6,
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.layout.radius.pill,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    fill: {
        height: '100%',
        borderRadius: theme.layout.radius.pill,
    },
});
