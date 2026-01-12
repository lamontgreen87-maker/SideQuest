export const APP_VERSION = "0.1.6";

export const LOCAL_SERVER_URL = "http://192.168.1.208:8000";
export const PROD_SERVER_URL = "https://d54aa6e74f0c-8000.proxy.runpod.net";
export const DEFAULT_SERVER_URL = PROD_SERVER_URL;
export const GIST_CONFIG_URL = null; // Disabled to make Pod the "only" server

export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/lamontgreen87-maker/SideQuest/releases/latest";
export const GITHUB_RELEASES_PAGE =
  "https://github.com/lamontgreen87-maker/SideQuest/releases/latest";

export const WALLETCONNECT_PROJECT_ID = "7fb717fa1a1cc0f849a70d99c6837f0a";
export const WALLETCONNECT_RELAY_URL = "wss://relay.walletconnect.org";
export const WALLETCONNECT_METADATA = {
  name: "Side Quest",
  description: "Side Quest wallet login",
  url: "https://sidequestai.org",
  icons: ["https://walletconnect.com/walletconnect-logo.png"],
};

export const WALLETCONNECT_SESSION_PARAMS = {
  requiredNamespaces: {
    eip155: {
      methods: [
        "eth_chainId",
        "eth_sendTransaction",
        "eth_signTypedData_v4",
      ],
      chains: ["eip155:1"],
      events: ["chainChanged", "accountsChanged"],
    },
  },
  optionalNamespaces: {
    eip155: {
      methods: [
        "eth_sign",
        "eth_signTypedData",
        "wallet_switchEthereumChain",
        "personal_sign",
      ],
      chains: ["eip155:1"],
      events: ["chainChanged", "accountsChanged"],
    },
  },
};

export const GOOGLE_WEB_CLIENT_ID =
  "816546538702-6mrlsg51b2u6v6tdinc07fsnhbvmeqha.apps.googleusercontent.com";

export const STORAGE_KEYS = {
  serverUrl: "dc_server_url",
  sessions: "dc_sessions",
  lastSession: "dc_last_session",
  lastCharacter: "dc_last_character",
  fastMode: "dc_fast_mode",
  rulesSession: "dc_rules_session",
  authToken: "dc_auth_token",
  authWallet: "dc_auth_wallet",
  apiKey: "dc_api_key",
  adminKey: "dc_admin_key",
};

export const INTRO_PROMPTS = [
  // Combat / Threat
  "The tavern door explodes inward. Three armoured figures stride in, weapons drawn, pointing straight at you. 'There is the traitor!' one shouts.",
  "You wake to the sound of steel sliding from a scabbard. A goblin stands over your bedroll, dagger raised. It hasn't seen you open your eyes yet.",
  "An arrow thuds into the tree trunk, inches from your face. 'Next one goes in your eye!' a voice yells from the treeline.",

  // Mystery / Message
  "A dying messenger stumbles into your arms, pressing a blood-stained scroll into your hand. 'Don't... let them... find it,' he gasps.",
  "You find a glass bottle washed up on the gray shore. Inside, a piece of parchment glows with faint blue light, shifting as you look at it.",
  "A raven lands on your shoulder, carrying a heavy gold ring tied to its leg. It speaks with a human voice: ' The master is dead. Run.'",
  "You return to your room to find it ransacked. A single black card has been left on your pillow with coordinates written in silver ink.",

  // Supernatural / Magic
  "The ancient runes carved into the cave wall suddenly flare with violet light. A deep voice resonates in your skull: 'FINALLY, A VESSEL.'",
  "Your reflection in the inn's mirror creates a motion you didn't make. It points urgently toward the window behind you.",
  "The sword you just bought starts humming and vibrating on your hip. It pulls your hand toward the alleyway on your left.",

  // Environment / Survival
  "The ground beneath your feet gives way with a sickening crack. You slide into darkness, catching a root just before falling into the abyss below.",
  "You wake up in a cart full of hay. The driver is dead, and the horses are spooked, galloping toward a cliff edge.",
  "A thick, unnatural fog rolls into the village square. Every sound vanishes. Then, you hear the slow dragging of chains.",
  "You are standing in a grand library. Every book suddenly falls off the shelves at once. In the silence that follows, a child giggles.",
];
