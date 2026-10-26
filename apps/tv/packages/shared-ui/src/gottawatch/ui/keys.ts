// Back / Menu / any-D-pad key plumbing. Back arrives two ways on Android TV: BackHandler
// (KEYCODE_BACK 4) and react-native-keyevent (the starter maps keycode 67). Both are wired and
// de-duplicated. A Back handler returns true when it handled the key; false → exit the app (MF-5).
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import RemoteControlManager from '../../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../../app/remote-control/SupportedKeys';

let lastBack = 0;

export function useBack(handler: () => boolean, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const run = (fromBackHandler: boolean) => {
      const now = Date.now();
      if (now - lastBack < 300) return true;
      lastBack = now;
      const handled = ref.current();
      if (!handled && !fromBackHandler && Platform.OS === 'android') BackHandler.exitApp();
      return handled;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', () => run(true));
    const listener = RemoteControlManager.addKeydownListener((k: SupportedKeys) => {
      if (k === SupportedKeys.Back) run(false);
    });
    return () => {
      sub.remove();
      RemoteControlManager.removeKeydownListener(listener);
    };
  }, [active]);
}

export function useKey(onKey: (k: SupportedKeys) => void, active = true) {
  const ref = useRef(onKey);
  ref.current = onKey;
  useEffect(() => {
    if (!active) return;
    const listener = RemoteControlManager.addKeydownListener((k: SupportedKeys) => ref.current(k));
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, [active]);
}

export const isDpad = (k: SupportedKeys) =>
  k === SupportedKeys.Up || k === SupportedKeys.Down || k === SupportedKeys.Left || k === SupportedKeys.Right;
export { SupportedKeys };
