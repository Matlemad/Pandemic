module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Temporaneamente disabilitato - non usiamo reanimated nel codice
    // plugins: ['react-native-reanimated/plugin'],
  };
};

