import { Platform } from 'react-native';

export const fonts = {
    header: "Cinzel_700Bold",
    headerRegular: "Cinzel_400Regular",
    body: Platform.select({ ios: "System", android: "Roboto" }),
    mono: Platform.select({ ios: "Courier", android: "monospace" }),
};

export const typography = {
    h1: { fontFamily: fonts.header, fontSize: 32, lineHeight: 40, letterSpacing: 1 },
    h2: { fontFamily: fonts.header, fontSize: 24, lineHeight: 32, letterSpacing: 0.5 },
    h3: { fontFamily: fonts.header, fontSize: 20, lineHeight: 28 },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
    bodySmall: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
    caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: "#888" },
    button: { fontFamily: fonts.header, fontSize: 16, textTransform: "uppercase", letterSpacing: 2 },
};
