/**
 * Expo config plugin — injects custom iOS native modules (Objective-C) during prebuild.
 *
 * Copies .h/.m source files from ios-native-modules/ into the Xcode project,
 * adds them to build sources, and links required frameworks.
 */
const {
  withXcodeProject,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const SOURCE_DIR = 'ios-native-modules';

const HEADER_FILES = [
  'LanHostModule.h',
  'VenueDiscoveryModule.h',
  'BleAdvertisingModule.h',
];

const SOURCE_FILES = [
  'LanHostModule.m',
  'VenueDiscoveryModule.m',
  'BleAdvertisingModule.m',
];

function withIosNativeModules(config) {
  // Step 1: Copy source files into ios/<ProjectName>/
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const targetDir = path.join(projectRoot, 'ios', projectName);
      const sourceDir = path.join(projectRoot, SOURCE_DIR);

      if (!fs.existsSync(sourceDir)) {
        console.warn(`[withIosNativeModules] Source dir not found: ${sourceDir}`);
        return cfg;
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const allFiles = [...HEADER_FILES, ...SOURCE_FILES];
      for (const file of allFiles) {
        const src = path.join(sourceDir, file);
        const dest = path.join(targetDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withIosNativeModules] Copied ${file}`);
        } else {
          console.warn(`[withIosNativeModules] Missing: ${src}`);
        }
      }

      return cfg;
    },
  ]);

  // Step 2: Add files to Xcode project + link frameworks
  config = withXcodeProject(config, async (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;

    // Find the app's source group
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    let appGroupKey = null;
    for (const key in groups) {
      if (key.endsWith('_comment')) continue;
      const group = groups[key];
      if (group.name === projectName || group.path === projectName) {
        appGroupKey = key;
        break;
      }
    }

    if (!appGroupKey) {
      console.warn('[withIosNativeModules] App group not found, using main group');
      appGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    }

    // Helper: check if a file is already in the project
    function isFileAdded(fileName) {
      const refs = xcodeProject.hash.project.objects['PBXFileReference'] || {};
      return Object.keys(refs).some(
        (k) => !k.endsWith('_comment') && refs[k].path === fileName
      );
    }

    // Add .m source files (compiled)
    for (const file of SOURCE_FILES) {
      if (!isFileAdded(file)) {
        xcodeProject.addSourceFile(`${projectName}/${file}`, null, appGroupKey);
        console.log(`[withIosNativeModules] Added source: ${file}`);
      }
    }

    // Add .h header files (not compiled, just referenced)
    for (const file of HEADER_FILES) {
      if (!isFileAdded(file)) {
        xcodeProject.addHeaderFile(`${projectName}/${file}`, { target: xcodeProject.getFirstTarget().uuid }, appGroupKey);
        console.log(`[withIosNativeModules] Added header: ${file}`);
      }
    }

    // Link required frameworks
    xcodeProject.addFramework('Network.framework', { weak: false });
    xcodeProject.addFramework('CoreBluetooth.framework', { weak: false });

    console.log('[withIosNativeModules] Xcode project configured');
    return cfg;
  });

  return config;
}

module.exports = withIosNativeModules;
