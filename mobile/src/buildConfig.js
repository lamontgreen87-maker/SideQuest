import { NativeModules } from "react-native";

const nativeConfig = NativeModules.BuildConfigModule || {};

console.log("BuildConfig nativeConfig:", nativeConfig);

export const buildFlavor = String(nativeConfig.FLAVOR || "");
export const applicationId = String(nativeConfig.APPLICATION_ID || "");

// If IS_PLAY is explicitly set (true or false), use that value
// Otherwise fall back to checking flavor and applicationId
export const isPlayBuild =
  nativeConfig.IS_PLAY !== undefined
    ? nativeConfig.IS_PLAY === true
    : buildFlavor.toLowerCase().includes("play") ||
    applicationId === "com.lamontgreen.sidequest";

console.log("BuildConfig isPlayBuild:", isPlayBuild, "IS_PLAY:", nativeConfig.IS_PLAY, "flavor:", buildFlavor);
