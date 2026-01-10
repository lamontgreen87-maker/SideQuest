const RNFormData = require("react-native/Libraries/Network/FormData");
const globalScope = typeof globalThis !== "undefined" ? globalThis : global;
if (!globalScope.FormData) {
  globalScope.FormData = RNFormData;
}

require("react-native-get-random-values");
require("react-native-url-polyfill/auto");
const { isPlayBuild } = require("./src/buildConfig");
if (!isPlayBuild) {
  require("@walletconnect/react-native-compat");
}

const { registerRootComponent } = require("expo");

const App = require("./App").default;
registerRootComponent(App);
