import { NativeModules } from "react-native";

const nativeConfig = NativeModules.BuildConfigModule || {};

export const buildFlavor = String(nativeConfig.FLAVOR || "");
export const applicationId = String(nativeConfig.APPLICATION_ID || "");
export const isPlayBuild =
  Boolean(nativeConfig.IS_PLAY) ||
  buildFlavor.toLowerCase().includes("play") ||
  applicationId === "com.lamontgreen.sidequest";
