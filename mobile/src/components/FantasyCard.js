import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

export const FantasyCard = ({ children, style, variant = 'surface' }) => {
    const bg = variant === 'alt' ? theme.colors.surfaceAlt : theme.colors.surface;

    return (
        <View style={[styles.card, { backgroundColor: bg }, style]}>
            <View style={styles.innerBorder}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: theme.layout.radius.md,
        borderColor: theme.colors.border,
        borderWidth: 1,
        marginVertical: theme.spacing.sm,
        ...theme.layout.shadows.soft,
    },
    innerBorder: {
        flex: 1,
        borderRadius: theme.layout.radius.md - 1,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)', // Subtle inner bevel
        padding: theme.spacing.md,
    },
});
