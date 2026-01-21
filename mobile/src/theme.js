export const colors = {
  ink: "#0f0f10",
  panel: "#1a1a1c",
  panelAlt: "#242427",
  parchment: "#f6efe7",
  gold: "#f4c66f",
  mutedGold: "#c9b8a6",
  accent: "#f25a67",
  border: "#2b2b2f",
  success: "#3bb273",
  warning: "#f1a94e",
  crimson: "#d93025",
  emerald: "#3bb273",

  // Semantic aliases
  background: "#0f0f10",
  surface: "#1a1a1c",
  surfaceAlt: "#242427",
  textPrimary: "#f6efe7",
  textSecondary: "#c9b8a6",
  textMuted: "#666666",
  goldDim: "rgba(244, 198, 111, 0.5)",
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const fonts = {
  header: "Cinzel_700Bold",
  body: "System",
  button: "System", // Or Cinzel_400Regular if preferred
};

export const layout = {
  radius,
  shadows: {
    soft: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
  },
};

export const theme = {
  colors,
  spacing,
  radius,
  fonts,
  layout,
};
