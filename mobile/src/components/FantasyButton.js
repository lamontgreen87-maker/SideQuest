import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

export const FantasyButton = ({ title, onPress, variant = 'gold', disabled, style }) => {
    // Gradient colors map
    const gradients = {
        gold: theme.gradients.gold,
        crimson: theme.gradients.crimson,
        ghost: ['transparent', 'transparent'], // No gradient
    };

    const gradientColors = gradients[variant] || gradients.gold;

    // Text color map
    const textColors = {
        gold: theme.colors.background,
        crimson: '#fff',
        ghost: theme.colors.gold,
    };

    const textColor = textColors[variant] || textColors.gold;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            disabled={disabled}
            style={[styles.container, style]}
        >
            <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                    styles.gradient,
                    variant === 'ghost' && styles.ghostBorder,
                    disabled && styles.disabled
                ]}
            >
                <Text style={[styles.text, { color: textColor }]}>{title}</Text>
            </LinearGradient>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: theme.spacing.sm,
        borderRadius: theme.layout.radius.sm,
        ...theme.layout.shadows.glow,
    },
    gradient: {
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        borderRadius: theme.layout.radius.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ghostBorder: {
        borderColor: theme.colors.goldDim,
        borderWidth: 1,
    },
    text: {
        ...theme.typography.button,
        fontWeight: 'bold',
    },
    disabled: {
        opacity: 0.5,
    },
});
