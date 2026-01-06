import React from "react";
import { SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export default function Screen({ children, style }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
});
