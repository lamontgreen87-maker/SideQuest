export const APP_VERSION = "0.1.5";

export const LOCAL_SERVER_URL = "http://192.168.1.208:8000";
export const PROD_SERVER_URL = "https://sidequestai.org";
export const DEFAULT_SERVER_URL = PROD_SERVER_URL;
export const GIST_CONFIG_URL =
  "https://gist.githubusercontent.com/lamontgreen87-maker/ad3e3e7abcf09f755a5087aaa15a5bd1/raw/config.json";

export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/lamontgreen87-maker/SideQuest/releases/latest";
export const GITHUB_RELEASES_PAGE =
  "https://github.com/lamontgreen87-maker/SideQuest/releases/latest";

export const WALLETCONNECT_PROJECT_ID = "7fb717fa1a1cc0f849a70d99c6837f0a";
export const WALLETCONNECT_METADATA = {
  name: "Side Quest",
  description: "Side Quest wallet login",
  url: "https://sidequest.local",
  icons: ["https://walletconnect.com/walletconnect-logo.png"],
};

export const STORAGE_KEYS = {
  serverUrl: "dc_server_url",
  sessions: "dc_sessions",
  lastSession: "dc_last_session",
  fastMode: "dc_fast_mode",
  rulesSession: "dc_rules_session",
  authToken: "dc_auth_token",
  authWallet: "dc_auth_wallet",
  apiKey: "dc_api_key",
  adminKey: "dc_admin_key",
};

export const INTRO_PROMPTS = [
  "Rain drums on the inn roof. A stranger watches you from the hearth. What do you do?",
  "A cold wind howls through the ruins. Your boots scrape stone. Who are you?",
  "You wake to torchlight and a muffled chant beyond the door. What's your name?",
  "A messenger bursts in with a sealed letter addressed to you. Who are you?",
];
