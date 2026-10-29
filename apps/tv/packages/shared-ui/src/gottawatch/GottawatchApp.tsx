// Gottawatch TV app shell: a tiny screen state machine (no react-navigation needed for 5 screens).
// Boot → Pairing → Pair success → Home ⇄ Handoff / About. ADR-0009 Tier 1, ADR-0007 guardrails.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { createEnv } from './core/env';
import { newDeviceId } from './core/deviceId';
import { newBaseline, type TitleCard } from './core/home';
import { clearPairing, loadStored, saveBaseline, saveDeviceId, saveHousehold, savePairing } from './core/storage';
import { BootScreen, ErrorScreen } from './screens/Common';
import { PairingScreen, PairSuccess } from './screens/PairingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HandoffScreen } from './screens/HandoffScreen';
import { AboutScreen } from './screens/AboutScreen';
import { ActionsSheet } from './screens/ActionsSheet';
import { WatchedScreen } from './screens/WatchedScreen';
import { AskScreen, type AskState } from './screens/AskScreen';
import { groupByTitle } from './core/home';
import type { ToastState } from './screens/Toast';
import { INFO_TOAST_MS, UNDO_TOAST_MS } from './core/home';
import { useHomeData } from './screens/useHomeData';
import { colors } from './ui/theme';
import { TV_DISCONNECTED_BANNER } from '@gottawatch/contract';

type Route =
  | { k: 'boot' }
  | { k: 'pairing'; banner?: string; intro: boolean }
  | { k: 'paired' }
  | { k: 'home' }
  | { k: 'handoff'; card: TitleCard; from?: 'ask' }
  | { k: 'ask' }
  | { k: 'about'; from: 'home' | 'pairing' }
  | { k: 'watched' };

interface Session {
  deviceId: string;
  token?: string;
  pairedAt?: number;
  householdName?: string;
  timezone?: string;
  baseline?: number;
}

const UNPAIRED_BANNER = TV_DISCONNECTED_BANNER;

export default function GottawatchApp() {
  const envResult = useMemo(() => {
    try {
      return { ok: true as const, ...createEnv() };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);
  if (!envResult.ok) {
    return <ErrorScreen title="This build is misconfigured" body={envResult.message} action="OK" onAction={() => {}} />;
  }
  return <App {...envResult} />;
}

function App({ config, api }: ReturnType<typeof createEnv>) {
  const [route, setRoute] = useState<Route>({ k: 'boot' });
  const [session, setSession] = useState<Session | null>(null);
  const [slowBoot, setSlowBoot] = useState(false);
  const [sheet, setSheet] = useState<TitleCard | null>(null);
  const [restoreKey, setRestoreKey] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setSlowBoot(true), 2000);
    (async () => {
      const s = await loadStored().catch(() => ({}) as Awaited<ReturnType<typeof loadStored>>);
      let deviceId = s.deviceId;
      if (!deviceId) {
        deviceId = newDeviceId((n) => Crypto.getRandomBytes(n));
        await saveDeviceId(deviceId);
      }
      const now = Date.now();
      const baseline = newBaseline(s.lastSessionEnd, s.newBaseline, now);
      if (baseline !== undefined) await saveBaseline(baseline);
      setSession({ deviceId, token: s.token, pairedAt: s.pairedAt, householdName: s.householdName, baseline });
      setRoute(s.token ? { k: 'home' } : { k: 'pairing', intro: !s.deviceId });
      clearTimeout(t);
    })();
    return () => clearTimeout(t);
  }, []);

  const onUnauthorized = useCallback(() => {
    void clearPairing();
    setSession((p) => (p ? { deviceId: p.deviceId } : p));
    setSheet(null);
    setRoute({ k: 'pairing', banner: UNPAIRED_BANNER, intro: false });
  }, []);

  const onPaired = useCallback(
    async (token: string) => {
      const at = Date.now();
      await savePairing(token, at);
      setSession((p) => (p ? { ...p, token, pairedAt: at } : p));
      setRoute({ k: 'paired' });
      let household: string | undefined;
      try {
        const me = await api.me(token);
        if (me.kind === 'device' && me.householdName) household = me.householdName;
        if (me.kind === 'device' && me.timezone) setSession((p) => (p ? { ...p, timezone: me.timezone } : p));
      } catch {
        /* Home will surface problems */
      }
      if (household) {
        await saveHousehold(household);
        setSession((p) => (p ? { ...p, householdName: household } : p));
      }
      setTimeout(() => setRoute({ k: 'home' }), 1500); // static ✓, auto-continue (ADR-0009)
    },
    [api],
  );

  // Refresh the household name once per launch when already paired.
  const meDone = useRef(false);
  useEffect(() => {
    if (meDone.current || !session?.token || route.k !== 'home') return;
    meDone.current = true;
    api
      .me(session.token)
      .then((me) => {
        if (me.kind === 'device' && me.timezone) setSession((p) => (p ? { ...p, timezone: me.timezone } : p));
        if (me.kind === 'device' && me.householdName && me.householdName !== session.householdName) {
          void saveHousehold(me.householdName);
          setSession((p) => (p ? { ...p, householdName: me.householdName } : p));
        }
      })
      .catch(() => {});
  }, [api, session, route.k]);

  if (route.k === 'boot' || !session) return <BootScreen slow={slowBoot} />;

  if (route.k === 'pairing' || (route.k === 'about' && route.from === 'pairing')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {route.k === 'pairing' ? (
          <PairingScreen
            api={api}
            config={config}
            deviceId={session.deviceId}
            banner={route.banner}
            showIntro={route.intro}
            onPaired={(t) => void onPaired(t)}
            onAbout={() => setRoute({ k: 'about', from: 'pairing' })}
            active
          />
        ) : (
          <AboutScreen config={config} paired={false} active onBack={() => setRoute({ k: 'pairing', intro: false })} onUnpair={() => {}} />
        )}
      </View>
    );
  }
  if (route.k === 'paired') return <PairSuccess householdName={session.householdName} />;
  if (!session.token) return <BootScreen slow={slowBoot} />;

  return (
    <PairedArea
      key={String(session.pairedAt ?? 0)}
      config={config}
      api={api}
      token={session.token}
      session={session}
      route={route}
      setRoute={setRoute}
      sheet={sheet}
      setSheet={setSheet}
      restoreKey={restoreKey}
      setRestoreKey={setRestoreKey}
      onUnauthorized={onUnauthorized}
      onUnpair={async () => {
        await clearPairing();
        setSession((p) => (p ? { deviceId: p.deviceId } : p));
        setRoute({ k: 'pairing', intro: false });
      }}
    />
  );
}

interface AreaProps {
  config: ReturnType<typeof createEnv>['config'];
  api: ReturnType<typeof createEnv>['api'];
  token: string;
  session: Session;
  route: Route;
  setRoute: (r: Route) => void;
  sheet: TitleCard | null;
  setSheet: (c: TitleCard | null) => void;
  restoreKey?: string;
  setRestoreKey: (k: string | undefined) => void;
  onUnauthorized: () => void;
  onUnpair: () => void;
}

/** Everything that needs a device token. Home data lives here so it survives Handoff/About. */
function PairedArea({ config, api, token, session, route, setRoute, sheet, setSheet, restoreKey, setRestoreKey, onUnauthorized, onUnpair }: AreaProps) {
  const data = useHomeData(api, token, config.feedPollMs, onUnauthorized);
  const onHome = route.k === 'home';
  const [toast, setToastState] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setToast = useCallback((t: ToastState | null) => {
    clearTimeout(toastTimer.current);
    setToastState(t);
    if (t) toastTimer.current = setTimeout(() => setToastState(null), t.undo ? UNDO_TOAST_MS : INFO_TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  // Every Mark seen path shows "Marked as seen · Undo" (ux §5.5a).
  const markSeen = useCallback(
    async (recId: string, title: string) => {
      setToast({ text: 'Marked as seen', undo: { recId, title } });
      await data.markSeen(recId, title);
    },
    [data, setToast],
  );
  const undo = useCallback(async () => {
    const u = toast?.undo;
    if (!u) return;
    setToast(null);
    const ok = await data.unmarkSeen(u.recId, u.title);
    setToast({ text: ok ? 'Back in your list' : "Couldn't undo. Try again from Watched." });
  }, [toast, data, setToast]);
  const homeData = { ...data, markSeen };
  const [askState, setAskState] = useState<AskState>({ k: 'idle' });
  const cards = React.useMemo(() => groupByTitle(data.items), [data.items]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {onHome && (
        <HomeScreen
          config={config}
          data={homeData}
          householdName={session.householdName}
          timezone={session.timezone}
          baseline={session.baseline}
          active={!sheet}
          restoreKey={restoreKey}
          onOpen={(card, via) => {
            setRestoreKey(via === 'cta' ? 'cta' : card.key);
            setRoute({ k: 'handoff', card });
          }}
          onAbout={() => setRoute({ k: 'about', from: 'home' })}
          onMenu={(card) => setSheet(card)}
          onWatched={() => setRoute({ k: 'watched' })}
          onAsk={() => setRoute({ k: 'ask' })}
          toast={toast}
          onUndo={() => void undo()}
          onDismissToast={() => setToast(null)}
        />
      )}
      {onHome && sheet && (
        <ActionsSheet
          card={sheet}
          active
          onClose={() => setSheet(null)}
          onSeen={() => {
            const c = sheet;
            setSheet(null);
            void markSeen(c.primary.id, c.title);
          }}
        />
      )}
      {route.k === 'handoff' && (
        <HandoffScreen card={route.card} config={config} active onClose={() => setRoute(route.from === 'ask' ? { k: 'ask' } : { k: 'home' })} />
      )}
      {route.k === 'ask' && (
        <AskScreen
          api={api}
          token={token}
          active
          cards={cards}
          state={askState}
          setState={setAskState}
          onBack={() => {
            setRestoreKey('cta');
            setRoute({ k: 'home' });
          }}
          onOpen={(card) => setRoute({ k: 'handoff', card, from: 'ask' })}
          onUnauthorized={onUnauthorized}
        />
      )}
      {route.k === 'watched' && (
        <WatchedScreen
          api={api}
          token={token}
          active
          onBack={() => {
            setRestoreKey('cta');
            setRoute({ k: 'home' });
          }}
          onPutBack={data.unmarkSeen}
          onUnauthorized={onUnauthorized}
        />
      )}
      {route.k === 'about' && (
        <AboutScreen
          config={config}
          householdName={session.householdName}
          pairedAt={session.pairedAt}
          paired
          active
          onBack={() => {
            setRestoreKey('cta');
            setRoute({ k: 'home' });
          }}
          onUnpair={onUnpair}
        />
      )}
    </View>
  );
}
