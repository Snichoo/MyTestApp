// metro.config.js (in project root)
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add 'zip' to assetExts so test.zip is recognized
config.resolver.assetExts.push("zip");

module.exports = config;
