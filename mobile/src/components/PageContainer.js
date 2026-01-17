import React from 'react';
import { StyleSheet, View, StatusBar, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

export const PageContainer = ({ children, style }) => {
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
            <LinearGradient
                colors={theme.gradients.background}
                style={styles.gradient}
            >
                <SafeAreaView style={[styles.content, style]}>
                    {children}
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    gradient: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
});
