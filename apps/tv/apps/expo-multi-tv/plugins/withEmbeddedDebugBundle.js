// Gottawatch: embed the JS bundle in debug APKs so a sideloaded debug build
// runs on the Fire TV stick without a Metro dev server (TV-01).
// Opt out with WC_DEBUG_USE_METRO=1 at prebuild time for live-reload development.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "debuggableVariants = [] // Gottawatch: embed bundle in debug";

module.exports = function withEmbeddedDebugBundle(config) {
  if (process.env.WC_DEBUG_USE_METRO === "1") return config;
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes(MARKER)) {
      const next = src.replace(/^react \{\s*$/m, (m) => `${m}\n    ${MARKER}`);
      if (next === src) {
        throw new Error("withEmbeddedDebugBundle: could not find the `react {` block in app/build.gradle");
      }
      src = next;
    }
    config.modResults.contents = src;
    return config;
  });
};
