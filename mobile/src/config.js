export const APP_VERSION = "0.1.6";

export const LOCAL_SERVER_URL = "http://192.168.1.208:8000";
export const PROD_SERVER_URL = "https://x1yi7ab2wchx3j-8000.proxy.runpod.net";
export const DEFAULT_SERVER_URL = PROD_SERVER_URL;
// To enable the "Refresh" button, create a GitHub Gist with this JSON:
// { "serverUrl": "https://x1yi7ab2wchx3j-8000.proxy.runpod.net" }
// Then paste the RAW gist URL below (e.g., https://gist.githubusercontent.com/username/gist-id/raw/config.json)
export const GIST_CONFIG_URL = "https://gist.githubusercontent.com/lamontgreen87-maker/ad3e3e7abcf09f755a5087aaa15a5bd1/raw";


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

export const INTRO_PROMPTS = [];
