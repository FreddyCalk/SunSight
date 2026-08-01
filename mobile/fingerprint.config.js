/** @type {import('@expo/fingerprint').Config} */
const config = {
  // Marketing version / buildNumber must not change runtimeVersion when CI
  // patch-bumps after a successful preview deploy; otherwise OTA breaks.
  sourceSkips: ['ExpoConfigVersions'],
};

module.exports = config;
