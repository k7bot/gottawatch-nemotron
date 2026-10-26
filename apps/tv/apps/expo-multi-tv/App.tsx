import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GottawatchApp, gottawatchFonts } from '@multi-tv/shared-ui';
import { LogBox } from 'react-native';
import '../../packages/shared-ui/src/app/configureRemoteControl';

// Suppress specific deprecation warnings that don't affect functionality
// These warnings come from libraries using deprecated React methods
if (__DEV__) {
  // Suppress in LogBox
  LogBox.ignoreLogs([
    /findNodeHandle is deprecated/,
    /findHostInstance_DEPRECATED is deprecated/,
  ]);

  // Also suppress at console level for warnings that slip through
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('findNodeHandle is deprecated') ||
      message.includes('findHostInstance_DEPRECATED is deprecated')
    ) {
      return;
    }
    originalWarn(...args);
  };
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function App() {
  // Inter + Fraunces static TTFs (ADR-0009 Tier 1; licenses in shared-ui/src/assets/fonts/FONTS.md).
  const [loaded, error] = useFonts(gottawatchFonts);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
      if (error) {
        console.warn(`Error in loading fonts: ${error}`);
      }
    }
  }, [loaded, error]);

  // The sample's AppNavigator (still in @multi-tv/shared-ui) is unused; GottawatchApp replaces it.
  if (!loaded && !error) {
    return null;
  }
  return <GottawatchApp />;
}
