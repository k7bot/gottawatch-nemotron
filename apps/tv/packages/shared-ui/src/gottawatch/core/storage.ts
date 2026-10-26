// Persistent client state (AsyncStorage). The device token is the only secret; it is never logged.
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  deviceId: 'wc.deviceId',
  token: 'wc.deviceToken',
  pairedAt: 'wc.pairedAt',
  household: 'wc.householdName',
  sessionEnd: 'wc.lastSessionEnd',
  baseline: 'wc.newBaseline',
} as const;

export interface Stored {
  deviceId?: string;
  token?: string;
  pairedAt?: number;
  householdName?: string;
  lastSessionEnd?: number;
  newBaseline?: number;
}

const toNum = (v: string | null) => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

export async function loadStored(): Promise<Stored> {
  const pairs = await AsyncStorage.multiGet(Object.values(K));
  const m = Object.fromEntries(pairs);
  return {
    deviceId: m[K.deviceId] ?? undefined,
    token: m[K.token] ?? undefined,
    pairedAt: toNum(m[K.pairedAt] ?? null),
    householdName: m[K.household] ?? undefined,
    lastSessionEnd: toNum(m[K.sessionEnd] ?? null),
    newBaseline: toNum(m[K.baseline] ?? null),
  };
}

export const saveDeviceId = (id: string) => AsyncStorage.setItem(K.deviceId, id);
export const savePairing = (token: string, at: number) => AsyncStorage.multiSet([[K.token, token], [K.pairedAt, String(at)]]);
export const saveHousehold = (name: string) => AsyncStorage.setItem(K.household, name);
export const saveSessionEnd = (at: number) => AsyncStorage.setItem(K.sessionEnd, String(at));
export const saveBaseline = (at: number) => AsyncStorage.setItem(K.baseline, String(at));
/** Unpair / 401: drop the token and household; keep deviceId (it's not a secret and identifies the TV). */
export const clearPairing = () => AsyncStorage.multiRemove([K.token, K.pairedAt, K.household]);
