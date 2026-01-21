import React from 'react';
import { StyleSheet, View, StatusBar, SafeAreaView } from 'react-native';

export const PageContainer = ({ children, style }) => {
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#f0f0f0" />
            <SafeAreaView style={[styles.content, style]}>
                {children}
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f0f0', // Plain light gray
    },
    content: {
        flex: 1,
        marginTop: 20,
    },
});
