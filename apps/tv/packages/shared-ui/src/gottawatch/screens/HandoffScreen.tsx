// Search-tip & handoff (ux-design §5.4, tv-app §3.4). Tier 1: 4 s tip (HANDOFF_TIP_MS) that pauses
// on any D-pad press; OK opens now; Back cancels. ADR-0012: a named service with no verified launcher
// (all of them today) is tip-only: 'Open {service} and search for "{title}"', no countdown, no failure.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import type { WcConfig } from '../core/config';
import { cardServiceName, handoffHeadline, handoffRecommenders, type TitleCard } from '../core/home';
import { Button } from '../ui/Button';
import { Avatar, Poster } from '../ui/bits';
import { colors, px, type } from '../ui/theme';
import { isDpad, SupportedKeys, useBack, useKey } from '../ui/keys';
import { Backdrop, Screen } from './Common';
import { hasLauncher, launchService } from '../core/launch';

type Variant = 'opening' | 'named' | 'unknown' | 'failed';

export function HandoffScreen({ card, config, active, onClose }: { card: TitleCard; config: WcConfig; active: boolean; onClose: () => void }) {
  const service = card.service;
  const name = cardServiceName(card);
  const [variant, setVariant] = useState<Variant>(!name ? 'unknown' : service && hasLauncher(service) ? 'opening' : 'named');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const launched = useRef(false);

  const open = useCallback(async () => {
    if (launched.current || !service) return;
    launched.current = true;
    const ok = await launchService(service, card.title);
    if (!ok) setVariant('failed');
  }, [service, card.title]);

  useEffect(() => {
    if (variant !== 'opening' || paused) return;
    const step = 100;
    const t = setInterval(() => setElapsed((e) => e + step), step);
    return () => clearInterval(t);
  }, [variant, paused]);
  useEffect(() => {
    if (variant === 'opening' && elapsed >= config.handoffTipMs) void open();
  }, [elapsed, variant, config.handoffTipMs, open]);

  useKey((k) => {
    if (variant !== 'opening') return;
    if (isDpad(k)) setPaused(true);
    if (k === SupportedKeys.Enter) void open();
  }, active);
  useBack(() => {
    onClose();
    return true;
  }, active);

  const recs = handoffRecommenders(card);
  const overline =
    variant === 'opening'
      ? `Opening ${name ?? 'your streaming app'}…`
      : variant === 'named'
        ? `Open ${name}`
        : variant === 'unknown'
          ? 'Watch it in your streaming app'
          : "Couldn't open the app";
  const progress = Math.min(1, elapsed / config.handoffTipMs);

  return (
    <Screen>
      <Backdrop title={card.title} dim />
      <SpatialNavigationRoot isActive={active}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(96) }}>
          <Poster title={card.title} url={card.primary.poster} width={360} height={540} />
          <View style={{ flex: 1, marginLeft: px(80) }}>
            <Text style={[type.label, { color: variant === 'failed' ? colors.danger : colors.accent, textTransform: 'uppercase', letterSpacing: px(2) }]}>{overline}</Text>
            {variant === 'failed' && (
              <Text style={[type.body, { marginTop: px(12) }]}>Install it from the Appstore, then search for the title below.</Text>
            )}
            <Text style={[type.title, { marginTop: px(24) }]}>
              {variant === 'opening' ? 'When it opens, search for:' : variant === 'named' ? handoffHeadline(name, card.title) : 'Search for:'}
            </Text>
            <View style={{ marginTop: px(20), flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderWidth: px(4), borderColor: colors.text3, borderRadius: px(20), paddingHorizontal: px(32), paddingVertical: px(20), alignSelf: 'flex-start', maxWidth: px(1200) }}>
              <Magnifier />
              <Text numberOfLines={2} style={[type.display, { marginLeft: px(24), flexShrink: 1 }]}>{card.title}</Text>
            </View>
            {recs.rows.length ? (
              <View style={{ marginTop: px(32), maxWidth: px(1100) }}>
                <Text style={[type.label, { color: colors.text2 }]}>{recs.heading}</Text>
                {recs.rows.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: px(14) }}>
                    <Avatar id={r.id} name={r.name} />
                    <Text numberOfLines={2} style={[type.quote, { fontSize: px(28), lineHeight: px(38), marginLeft: px(16), flexShrink: 1 }]}>
                      {r.name}{r.note ? `: “${r.note}”` : ''}
                      {r.serviceName ? <Text style={[type.label, { color: colors.text3 }]}>{`   ·  On ${r.serviceName}`}</Text> : null}
                    </Text>
                  </View>
                ))}
                {recs.more > 0 ? <Text style={[type.label, { color: colors.text3, marginTop: px(10) }]}>{`and ${recs.more} more`}</Text> : null}
              </View>
            ) : null}
            {variant === 'opening' ? (
              <View style={{ marginTop: px(56) }}>
                <View style={{ height: px(8), width: px(900), backgroundColor: colors.surface2, borderRadius: px(4) }}>
                  <View style={{ height: px(8), width: px(900 * progress), backgroundColor: colors.accent, borderRadius: px(4) }} />
                </View>
                <Text style={[type.label, { color: colors.text3, marginTop: px(16) }]}>
                  {paused ? 'Paused   ·   ' : ''}OK  Open now   ·   Back  Stay here
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', marginTop: px(48) }}>
                <SpatialNavigationNode orientation="horizontal">
                  <DefaultFocus>
                    <Button label="Back to Gottawatch" variant="primary" onSelect={onClose} />
                  </DefaultFocus>
                </SpatialNavigationNode>
              </View>
            )}
          </View>
        </View>
      </SpatialNavigationRoot>
    </Screen>
  );
}

function Magnifier() {
  return (
    <View style={{ width: px(52), height: px(52) }}>
      <View style={{ width: px(38), height: px(38), borderRadius: px(19), borderWidth: px(5), borderColor: colors.text2 }} />
      <View style={{ position: 'absolute', width: px(20), height: px(6), backgroundColor: colors.text2, borderRadius: px(3), left: px(30), top: px(38), transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

