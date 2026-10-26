// Service launcher map (tv-app §3.4). EMPTY on purpose: no streaming-app launch target has been
// verified on Kiran's stick yet, and guessing package names/intents would be inventing facts.
// ADR-0012: unmapped services get the tip-only handoff ('Open {service} and search for …').
// Launching by package needs a native module + device-verified package names (where-to-watch.md §2).
import { Linking } from 'react-native';

export const LAUNCHERS: Record<string, (title: string) => string> = {};

export const hasLauncher = (service: string) => !!LAUNCHERS[service];

export async function launchService(service: string, title: string): Promise<boolean> {
  const build = LAUNCHERS[service];
  if (!build) return false;
  try {
    await Linking.openURL(build(title));
    return true;
  } catch {
    return false;
  }
}
