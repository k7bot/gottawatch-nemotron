// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname); // eslint-disable-line no-undef

// Configure Metro to work with Yarn workspaces
// Gottawatch: the shared API contract lives in the repo-root npm workspace (packages/contract).
const contractDir = path.resolve(__dirname, '../../../../packages/contract');
config.watchFolders = [
  path.resolve(__dirname, '../../packages/shared-ui'),
  path.resolve(__dirname, '../..'),
  contractDir,
];

config.resolver = {
  ...config.resolver,
  unstable_enableSymlinks: true,
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],
  extraNodeModules: {
    '@multi-tv/shared-ui': path.resolve(__dirname, '../../packages/shared-ui/src'),
  },
  // Always resolve the contract and zod from known places, so the TV bundle has exactly one
  // zod copy (this app's) and doesn't depend on the root npm install.
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === '@gottawatch/contract') {
      return { type: 'sourceFile', filePath: path.join(contractDir, 'src/index.ts') };
    }
    if (moduleName === 'zod' || moduleName.startsWith('zod/')) {
      return context.resolveRequest(
        { ...context, originModulePath: path.join(__dirname, 'package.json') },
        moduleName,
        platform,
      );
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// When enabled, the optional code below will allow Metro to resolve
// and bundle source files with TV-specific extensions
// (e.g., *.ios.tv.tsx, *.android.tv.tsx, *.tv.tsx)
//
// Metro will still resolve source files with standard extensions
// as usual if TV-specific files are not found for a module.
//
if (process.env?.EXPO_TV === '1') {
  const originalSourceExts = config.resolver.sourceExts;
  const tvSourceExts = [
    ...originalSourceExts.map((e) => `tv.${e}`),
    ...originalSourceExts,
  ];
  config.resolver.sourceExts = tvSourceExts;
}

module.exports = config;
