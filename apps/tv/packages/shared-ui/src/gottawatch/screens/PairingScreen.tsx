// Pairing (ux-design §5.3, tv-app §3.1): device-code style. QR + 3+3 code, 3 s polling while
// foregrounded, auto-renew on expiry/404/410 (capped at 3 renewals), static ✓ success → Home.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import type { ApiClient } from '../core/api';
import { ApiFailure } from '../core/api';
import type { WcConfig } from '../core/config';
import { countdown, peopleLabel, splitCode } from '../core/home';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/bits';
import { QrCode } from '../ui/QrCode';
import { colors, fonts, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';
import { Screen } from './Common';

type Phase =
  | { k: 'intro' }
  | { k: 'requesting' }
  | { k: 'code'; code: string; expiresAt: number; fresh: boolean }
  | { k: 'idle' } // renew cap reached: "Still there?"
  | { k: 'failed' };

const MAX_RENEWALS = 3;

interface Props {
  api: ApiClient;
  config: WcConfig;
  deviceId: string;
  banner?: string;
  showIntro: boolean;
  onPaired: (token: string) => void;
  onAbout: () => void;
  active: boolean;
}

export function PairingScreen({ api, config, deviceId, banner, showIntro, onPaired, onAbout, active }: Props) {
  const [phase, setPhase] = useState<Phase>(showIntro ? { k: 'intro' } : { k: 'requesting' });
  const [now, setNow] = useState(Date.now());
  const renewals = useRef(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  const done = useRef(false);

  const request = useCallback(
    async (auto: boolean) => {
      if (auto) {
        if (renewals.current >= MAX_RENEWALS) return setPhase({ k: 'idle' });
        renewals.current += 1;
      } else renewals.current = 0;
      setPhase({ k: 'requesting' });
      try {
        const r = await api.pairStart(deviceId);
        setPhase({ k: 'code', code: r.code, expiresAt: Date.parse(r.expiresAt), fresh: auto });
      } catch {
        setPhase({ k: 'failed' });
      }
    },
    [api, deviceId],
  );

  useEffect(() => {
    if (!showIntro) void request(false);
  }, [showIntro, request]);

  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => setForeground(st === 'active'));
    return () => s.remove();
  }, []);

  // 1 s clock for the countdown + expiry check.
  useEffect(() => {
    if (phase.k !== 'code') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.k]);
  useEffect(() => {
    if (phase.k === 'code' && foreground && now >= phase.expiresAt) void request(true);
  }, [now, phase, foreground, request]);

  // Poll /pair/status every PAIR_POLL_MS while the code is visible and the app is foregrounded.
  useEffect(() => {
    if (phase.k !== 'code' || !foreground || !active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await api.pairStatus(phase.code, deviceId);
        if (stop) return;
        if (s.status === 'paired' && !done.current) {
          done.current = true;
          onPaired(s.deviceToken);
          return;
        }
      } catch (e) {
        if (stop) return;
        if (e instanceof ApiFailure && e.kind === 'gone') return void request(true); // 404/410 → new code
      }
      timer = setTimeout(tick, config.pairPollMs);
    };
    timer = setTimeout(tick, config.pairPollMs);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [phase, foreground, active, api, deviceId, config.pairPollMs, onPaired, request]);

  useBack(() => false, active); // Back on Pairing exits (nothing to go back to)

  const qrBase = config.pwaBaseUrl ?? (config.apiMode === 'mock' ? 'https://wc.example' : undefined);
  const shortUrl = qrBase ? `${qrBase.replace(/^https?:\/\//, '')}/pair` : undefined;

  if (phase.k === 'intro') {
    return (
      <Screen>
        <SpatialNavigationRoot isActive={active}>
          <View style={{ flex: 1, paddingHorizontal: px(96), justifyContent: 'center' }}>
            <Wordmark size={56} />
            <Text style={[type.display, { marginTop: px(48), maxWidth: px(1300) }]}>Your friends' recommendations, on the big screen</Text>
            <Text style={[type.body, { marginTop: px(24), maxWidth: px(900) }]}>Pair this TV with your phone once. It takes about a minute.</Text>
            <View style={{ flexDirection: 'row', marginTop: px(56) }}>
              <SpatialNavigationNode orientation="horizontal">
                <DefaultFocus>
                  <Button label="Get started" variant="primary" onSelect={() => void request(false)} />
                </DefaultFocus>
              </SpatialNavigationNode>
            </View>
          </View>
        </SpatialNavigationRoot>
      </Screen>
    );
  }

  const [a, b] = phase.k === 'code' ? splitCode(phase.code) : ['———', '———'];
  return (
    <Screen>
      <SpatialNavigationRoot isActive={active}>
        <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: px(96), paddingVertical: px(54) }}>
          <View style={{ flex: 1, justifyContent: 'center', maxWidth: px(qrBase ? 1000 : 1400) }}>
            <Wordmark />
            {banner ? (
              <View style={{ marginTop: px(32), backgroundColor: colors.surface2, borderRadius: px(16), padding: px(20), alignSelf: 'flex-start' }}>
                <Text style={[type.body, { color: colors.text }]}>{banner}</Text>
              </View>
            ) : null}
            <Text style={[type.headline, { marginTop: px(40) }]}>Bring your circle to this TV</Text>
            <Text style={[type.body, { marginTop: px(28) }]}>
              {shortUrl ? (
                <>
                  1 · On your phone, scan the code or open <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{shortUrl}</Text>
                </>
              ) : (
                '1 · On your phone, open your Gottawatch link and choose Pair a TV'
              )}
            </Text>
            <Text style={[type.body, { marginTop: px(8) }]}>2 · Enter this code</Text>

            {phase.k === 'failed' ? (
              <View style={{ marginTop: px(40) }}>
                <Text style={[type.title, { color: colors.danger }]}>Can't reach Gottawatch. Check your connection.</Text>
              </View>
            ) : phase.k === 'idle' ? (
              <View style={{ marginTop: px(40) }}>
                <Text style={type.title}>Still there?</Text>
                <Text style={[type.body, { marginTop: px(8) }]}>Get a new code when you're ready to pair.</Text>
              </View>
            ) : (
              <>
                <View
                  accessibilityLabel={phase.k === 'code' ? `Pairing code ${phase.code.split('').join(' ')}` : 'Getting a code'}
                  style={{ marginTop: px(32), alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: px(32), paddingHorizontal: px(48), paddingVertical: px(20) }}
                >
                  <Text style={[type.code, phase.k !== 'code' && { color: colors.text3 }]}>{a}</Text>
                  <Text style={[type.code, { color: colors.text3, marginHorizontal: px(24) }]}>·</Text>
                  <Text style={[type.code, phase.k !== 'code' && { color: colors.text3 }]}>{b}</Text>
                </View>
                <Text style={[type.body, { marginTop: px(28), color: colors.text }]}>{phase.k === 'code' ? 'Waiting for your phone …' : 'Getting a code …'}</Text>
                {phase.k === 'code' && (
                  <Text style={[type.label, { color: colors.text3, marginTop: px(8) }]}>
                    {phase.fresh ? 'We made you a fresh code.  ·  ' : ''}New code in {countdown(phase.expiresAt - now)}
                  </Text>
                )}
              </>
            )}

            <View style={{ flexDirection: 'row', marginTop: px(48) }}>
              <SpatialNavigationNode orientation="horizontal">
                <View style={{ flexDirection: 'row' }}>
                  <DefaultFocus>
                    <Button label={phase.k === 'failed' ? 'Try again' : 'Get a new code'} variant={phase.k === 'failed' || phase.k === 'idle' ? 'primary' : 'secondary'} onSelect={() => void request(false)} />
                  </DefaultFocus>
                  <View style={{ width: px(24) }} />
                  <Button label="About" variant="quiet" onSelect={onAbout} />
                </View>
              </SpatialNavigationNode>
            </View>
          </View>

          {qrBase && phase.k === 'code' ? (
            <View style={{ width: px(560), alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: px(24), padding: px(30) }}>
                <QrCode value={`${qrBase}/pair?code=${phase.code}`} size={360} />
              </View>
              <Text style={[type.label, { marginTop: px(24) }]}>Scan with your phone camera</Text>
            </View>
          ) : null}
        </View>
      </SpatialNavigationRoot>
    </Screen>
  );
}

export function PairSuccess({ householdName }: { householdName?: string }) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: px(160), height: px(160), borderRadius: px(80), borderWidth: px(8), borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: px(84), lineHeight: px(100) }}>✓</Text>
        </View>
        <Text style={[type.display, { marginTop: px(48) }]}>You're paired!</Text>
        <Text style={[type.body, { marginTop: px(16) }]}>{householdName ? `Welcome, ${peopleLabel(householdName)}` : 'Welcome to Gottawatch'}</Text>
      </View>
    </Screen>
  );
}
