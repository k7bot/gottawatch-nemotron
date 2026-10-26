// Home (ux-design §5.1, ADR-0009 Tier 1): Header + Spotlight (Tonight's pick by default, or the
// focused row card) + one "From your circle" row. No animations (Tier 2).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  DefaultFocus,
  SpatialNavigationNode,
  SpatialNavigationRoot,
  SpatialNavigationVirtualizedList,
  type SpatialNavigationNodeRef,
} from 'react-tv-space-navigation';
import type { FeedItem, Tonight } from '../core/api';
import type { WcConfig } from '../core/config';
import { cardServiceName, chooseHero, greeting, groupByTitle, isNew, joinNames, metaLine, peopleLabel, recOverline, type TitleCard } from '../core/home';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { Avatar, AvatarStack, LampDot, Pill, Poster, Wordmark } from '../ui/bits';
import { MenuIcon } from '../ui/MenuIcon';
import { colors, layout, px, type } from '../ui/theme';
import { isDpad, SupportedKeys, useBack, useKey } from '../ui/keys';
import { Backdrop, ErrorScreen, Screen } from './Common';
import type { HomeData } from './useHomeData';
import { Toast, type ToastState } from './Toast';

export const TRANSITION_COPY = "Marked as seen. Here's what else your circle sent."; // (proposed) ux §5.1

interface Props {
  config: WcConfig;
  data: HomeData & { refreshAll: () => Promise<void>; markSeen: (recId: string, title: string) => Promise<void> };
  householdName?: string;
  timezone?: string;
  baseline?: number;
  active: boolean;
  onOpen: (card: TitleCard, via: 'cta' | 'row') => void;
  onAbout: () => void;
  onMenu: (card: TitleCard) => void;
  onWatched: () => void;
  onAsk?: () => void;
  toast?: ToastState | null;
  onUndo: () => void;
  onDismissToast: () => void;
  restoreKey?: string; // focus restore after handoff (title key or 'cta')
}

const SPOTLIGHT_DEBOUNCE_MS = 250;

export function HomeScreen({ config, data, householdName, timezone, baseline, active, onOpen, onAbout, onMenu, onWatched, onAsk, toast, onUndo, onDismissToast, restoreKey }: Props) {
  const now = Date.now();
  const cards = useMemo(() => groupByTitle(data.items), [data.items]);
  const hero = useMemo(() => chooseHero(cards, data.tonight), [cards, data.tonight]);
  const newCount = useMemo(() => cards.filter((c) => isNew(c, baseline)).length, [cards, baseline]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null); // row card in the Spotlight
  const [shownKey, setShownKey] = useState<string | null>(null); // debounced
  const [transition, setTransition] = useState(false);
  const ctaRef = useRef<SpatialNavigationNodeRef>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (focusedKey === null) setShownKey(null); // back to the pick: instant
    else debounce.current = setTimeout(() => setShownKey(focusedKey), SPOTLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(debounce.current);
  }, [focusedKey]);

  // Back rule (MF-5): anything but the default focus → Watch tonight; Back there → exit.
  const atCta = useRef(true);
  // If the toast closes while Undo has focus, put focus back on the default (Watch tonight).
  const undoFocused = useRef(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // Focus moves while the Undo toast is up clear the flag; the library's own move after Undo unmounts doesn't.
  const leftUndo = () => {
    if (toastRef.current?.undo) undoFocused.current = false;
  };
  useEffect(() => {
    if (!toast?.undo && undoFocused.current) {
      undoFocused.current = false;
      const t = setTimeout(() => ctaRef.current?.focus(), 0); // after the Spotlight re-renders
      return () => clearTimeout(t);
    }
  }, [toast]);
  useBack(() => {
    if (toast) {
      onDismissToast(); // Back while the toast shows just closes it (ux §5.5a)
      return true;
    }
    if (atCta.current || !ctaRef.current) return false;
    ctaRef.current.focus();
    return true;
  }, active);
  useKey((k) => {
    if (isDpad(k)) setTransition(false); // transition copy shows until focus moves
    if (k === SupportedKeys.Menu) {
      const c = focusedKey ? cards.find((x) => x.key === focusedKey) : hero.card;
      if (c) onMenu(c);
    }
  }, active);

  // After any Mark seen (button or Menu sheet), the next item's Watch button takes focus (Kiran, Oct 13).
  const lastUndo = useRef(toast?.undo);
  useEffect(() => {
    const u = toast?.undo;
    if (u && u !== lastUndo.current) {
      lastUndo.current = u;
      const t = setTimeout(() => ctaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    lastUndo.current = u;
  }, [toast]);
  const onSeen = useCallback(async () => {
    const recId = hero.card?.primary.id ?? hero.tonight?.recId;
    const title = hero.card?.title ?? hero.tonight?.title;
    if (!recId || !title) return;
    setTransition(true);
    await data.markSeen(recId, title);
  }, [hero.card, hero.tonight, data]);

  if (data.status === 'error' && !data.items.length) {
    return (
      <ErrorScreen
        title="Can't reach Gottawatch"
        body="Check the TV's internet connection."
        action="Try again"
        onAction={() => void data.refreshAll()}
        detail={config.showDevTags ? data.errorDetail : undefined}
      />
    );
  }

  const spot = shownKey ? cards.find((c) => c.key === shownKey) : undefined;
  const loading = data.status === 'loading';
  const empty = !loading && hero.kind === 'empty';
  const bgTitle = spot?.title ?? hero.card?.title ?? hero.tonight?.title;

  return (
    <Screen>
      <Backdrop title={empty || loading ? undefined : bgTitle} height={700} />
      <SpatialNavigationRoot isActive={active}>
        <SpatialNavigationNode orientation="vertical">
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ height: px(118), paddingTop: px(54), paddingHorizontal: px(layout.safeX), flexDirection: 'row', alignItems: 'center' }}>
              <Wordmark />
              {householdName ? (
                <View style={{ marginLeft: px(24) }}>
                  <Pill label={peopleLabel(householdName)} tone="surface" />
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              {data.offline && (
                <View style={{ backgroundColor: colors.surface2, borderRadius: px(999), paddingHorizontal: px(20), height: px(48), justifyContent: 'center', marginRight: px(24) }}>
                  <Text style={[type.label, { color: colors.text }]}>Offline · showing what we had · retrying</Text>
                </View>
              )}
              {config.apiMode === 'mock' && (
                <View style={{ marginRight: px(24) }}>
                  <Pill label="DEMO DATA" tone="dev" />
                </View>
              )}
              <Text style={[type.label, { marginRight: px(24) }]}>{greeting(new Date(now), timezone)}</Text>
              <SpatialNavigationNode orientation="horizontal">
                <View style={{ flexDirection: 'row' }}>
                  {onAsk ? (
                    <>
                      <Button label="Ask" variant="quiet" onSelect={onAsk} onFocus={() => { atCta.current = false; leftUndo(); setFocusedKey(null); }} />
                      <View style={{ width: px(16) }} />
                    </>
                  ) : null}
                  <Button label="Watched" variant="quiet" onSelect={onWatched} onFocus={() => { atCta.current = false; leftUndo(); setFocusedKey(null); }} />
                  <View style={{ width: px(16) }} />
                  <Button label="About" variant="quiet" onSelect={onAbout} onFocus={() => { atCta.current = false; leftUndo(); setFocusedKey(null); }} />
                </View>
              </SpatialNavigationNode>
            </View>

            {/* Spotlight */}
            <View style={{ height: px(482), paddingHorizontal: px(layout.safeX), justifyContent: 'flex-end', paddingBottom: px(24) }}>
              {loading ? (
                <SpotlightSkeleton />
              ) : empty ? (
                <EmptySpotlight onRefresh={() => void data.refreshAll()} />
              ) : (
                <>
                  {spot ? (
                    <RecSpotlight card={spot} now={now} top={!!hero.card && spot.key === hero.card.key && hero.kind !== 'newest'} />
                  ) : (
                    <PickContent hero={hero} now={now} transition={transition} showDevTags={config.showDevTags} />
                  )}
                  {/* The action row stays mounted while a row card previews (hidden under the key hints),
                      so Up from the row always lands on Watch tonight (ux §5.1 focus map). */}
                  <View style={{ marginTop: px(28), height: px(72) }}>
                    <View style={{ opacity: spot ? 0 : 1 }}>
                      <SpatialNavigationNode orientation="horizontal">
                        <View style={{ flexDirection: 'row' }}>
                          {(() => {
                            const cta = (
                              <Button
                                ref={ctaRef}
                                label="Watch"
                                icon="▶"
                                variant="primary"
                                onSelect={() => hero.card && onOpen(hero.card, 'cta')}
                                onFocus={() => { atCta.current = true; leftUndo(); setFocusedKey(null); }}
                              />
                            );
                            return !restoreKey || restoreKey === 'cta' ? <DefaultFocus>{cta}</DefaultFocus> : cta;
                          })()}
                          <View style={{ width: px(24) }} />
                          <Button label="Mark seen" icon="✓" onSelect={() => void onSeen()} onFocus={() => { atCta.current = false; leftUndo(); setFocusedKey(null); }} />
                        </View>
                      </SpatialNavigationNode>
                    </View>
                    {spot ? <KeyHints hasPick={!!data.tonight} /> : null}
                  </View>
                </>
              )}
            </View>

            {/* From your circle */}
            {!loading && !empty && cards.length > 0 && (
              <View style={{ paddingLeft: px(layout.safeX), marginTop: px(16) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: px(24) }}>
                  <Text style={type.title}>From your circle</Text>
                  {newCount > 0 && (
                    <View style={{ marginLeft: px(20) }}>
                      <Pill label={`${newCount} new`} />
                    </View>
                  )}
                </View>
                <View style={{ height: px(layout.cardH + 40) }}>
                  <SpatialNavigationVirtualizedList
                    orientation="horizontal"
                    data={cards}
                    itemSize={px(layout.cardW + layout.cardGap)}
                    additionalItemsRendered={4}
                    scrollDuration={0}
                    renderItem={({ item }: { item: TitleCard }) => (
                      <RowCard
                        card={item}
                        isNew={isNew(item, baseline)}
                        isDefault={restoreKey === item.key}
                        onFocus={() => { atCta.current = false; leftUndo(); setFocusedKey(item.key); }}
                        onSelect={() => onOpen(item, 'row')}
                      />
                    )}
                  />
                </View>
              </View>
            )}
            {loading && <RowSkeleton />}
            {toast ? <Toast toast={toast} onUndo={onUndo} onFocus={() => { atCta.current = false; undoFocused.current = true; setFocusedKey(null); }} /> : null}
          </View>
        </SpatialNavigationNode>
      </SpatialNavigationRoot>
    </Screen>
  );
}

function Overline({ text, accent, lamp, tag }: { text: string; accent?: boolean; lamp?: boolean; tag?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: px(12) }}>
      {lamp && <LampDot />}
      <Text style={[type.label, { color: accent ? colors.accent : colors.text2, textTransform: 'uppercase', letterSpacing: px(2) }]}>{text}</Text>
      {tag ? (
        <View style={{ marginLeft: px(16) }}>
          <Pill label={tag} tone="surface" />
        </View>
      ) : null}
    </View>
  );
}

function PickContent({ hero, now, transition, showDevTags }: { hero: ReturnType<typeof chooseHero>; now: number; transition: boolean; showDevTags: boolean }) {
  const t: Tonight | undefined = hero.tonight;
  const card = hero.card;
  const primary: FeedItem | undefined = card?.primary;
  const title = card?.title ?? t?.title ?? '';
  const isPick = hero.kind === 'pick';
  // The #1 ranked title (pick or fallback) is always "Top pick"; other titles name their senders (ADR-0016).
  const overline = hero.kind === 'pick' || hero.kind === 'fallback' ? 'Top pick' : 'Newest from your circle';
  return (
    <View style={{ maxWidth: px(1000) }}>
      {transition && <Text style={[type.label, { marginBottom: px(12) }]}>{TRANSITION_COPY}</Text>}
      {/* Lamp dot only on real bedrock picks (ADR-0009); dev builds tag the source (tv-app §3.3). */}
      <Overline text={overline} accent={hero.kind !== 'newest'} lamp={t?.source === 'bedrock' || t?.source === 'nebius'} tag={undefined /* source stays in t.source; no visible tag (Kiran, Oct 13) */} />
      <Text numberOfLines={2} style={type.display}>{title}</Text>
      {primary ? <Text style={[type.label, { marginTop: px(8) }]}>{card ? withService(metaLine(primary), card) : metaLine(primary)}</Text> : null}
      {t ? (
        <>
          <Text numberOfLines={2} style={[type.quote, { marginTop: px(20) }]}>{t.reason}</Text>
          {isPick && <Text style={[type.label, { color: colors.text3, marginTop: px(8) }]}>Chosen only from titles your circle sent</Text>}
        </>
      ) : card ? (
        <SenderNotes card={card} now={now} />
      ) : null}
    </View>
  );
}

function KeyHints({ hasPick }: { hasPick: boolean }) {
  const hint = [type.label, { color: colors.text3 }];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, height: px(72), flexDirection: 'row', alignItems: 'center' }}>
      <Text style={hint}>OK  Watch   ·   </Text>
      <MenuIcon color={colors.text3} />
      <Text style={hint}> Mark seen{hasPick ? '   ·   ▲  Back to top' : ''}</Text>
    </View>
  );
}

function SenderNotes({ card, now }: { card: TitleCard; now: number }) {
  const withNotes = card.senders.filter((s) => s.note).slice(0, 2);
  const more = card.senders.length - Math.max(withNotes.length, 1);
  return (
    <View style={{ marginTop: px(20) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AvatarStack people={card.senders.map((s) => ({ id: s.id, name: s.name }))} />
        <Text style={[type.label, { marginLeft: px(16) }]}>{recOverline(card, now)}</Text>
      </View>
      {withNotes.map((s) => (
        <Text key={s.id} numberOfLines={2} style={[type.quote, { marginTop: px(12) }]}>
          {card.senders.length > 1 ? `${s.name}: ` : ''}“{s.note}”
        </Text>
      ))}
      {card.senders.length > 1 && more > 0 && withNotes.length > 0 ? (
        <Text style={[type.label, { marginTop: px(4) }]}>and {more} more</Text>
      ) : null}
    </View>
  );
}

function RecSpotlight({ card, now, top }: { card: TitleCard; now: number; top?: boolean }) {
  return (
    <View style={{ maxWidth: px(1000) }}>
      <Overline accent={top} text={top ? 'Top pick' : card.senders.length > 1 ? `From ${joinNames(card.senders.map((s) => s.name))}` : recOverline(card, now)} />
      <Text numberOfLines={2} style={type.headline}>{card.title}</Text>
      <Text style={[type.label, { marginTop: px(8) }]}>{withService(metaLine(card.primary), card)}</Text>
      {card.senders.some((s) => s.note) ? (
        <SenderNotes card={card} now={now} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: px(20) }}>
          {card.senders.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', marginRight: px(24) }}>
              <Avatar id={s.id} name={s.name} />
              <Text style={[type.label, { marginLeft: px(12), color: colors.text }]}>{s.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function RowCard({ card, isNew: fresh, isDefault, onFocus, onSelect }: { card: TitleCard; isNew: boolean; isDefault: boolean; onFocus: () => void; onSelect: () => void }) {
  const inner = (
    <Focusable radius={layout.radiusCard} scale={1.08} onFocus={onFocus} onSelect={onSelect} accessibilityLabel={`${card.title}, ${recOverlineA11y(card)}`} style={{ marginTop: px(16) }}>
      {() => (
        <View>
          <Poster title={card.title} url={card.primary.poster} width={layout.cardW} height={layout.cardH} />
          {fresh && (
            <View style={{ position: 'absolute', top: px(12), left: px(12) }}>
              <Pill label="New" />
            </View>
          )}
          <View style={{ position: 'absolute', left: px(-8), bottom: px(-12) }}>
            <AvatarStack people={card.senders.map((s) => ({ id: s.id, name: s.name }))} />
          </View>
        </View>
      )}
    </Focusable>
  );
  return isDefault ? <DefaultFocus>{inner}</DefaultFocus> : inner;
}
const recOverlineA11y = (c: TitleCard) => `from ${joinNames(c.senders.map((s) => s.name))}`;

function EmptySpotlight({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={{ maxWidth: px(1000) }}>
      <Text style={type.headline}>Your circle is quiet tonight</Text>
      <Text style={[type.body, { marginTop: px(16) }]}>When a friend recommends something from their phone, it shows up here.</Text>
      <View style={{ flexDirection: 'row', marginTop: px(32) }}>
        <SpatialNavigationNode orientation="horizontal">
          <DefaultFocus>
            <Button label="Refresh" variant="primary" onSelect={onRefresh} />
          </DefaultFocus>
        </SpatialNavigationNode>
      </View>
    </View>
  );
}

const block = (w: number, h: number, mt = 0) => (
  <View style={{ width: px(w), height: px(h), marginTop: px(mt), backgroundColor: colors.surface1, borderRadius: px(12) }} />
);
function SpotlightSkeleton() {
  return (
    <View accessibilityLabel="Loading">
      {block(260, 28)}
      {block(760, 76, 16)}
      {block(420, 28, 16)}
      {block(900, 40, 24)}
      {block(640, 40, 12)}
      <View style={{ flexDirection: 'row', marginTop: px(28) }}>
        {block(280, 72)}
        <View style={{ width: px(24) }} />
        {block(220, 72)}
      </View>
    </View>
  );
}
function RowSkeleton() {
  return (
    <View style={{ paddingLeft: px(layout.safeX), marginTop: px(16) }}>
      {block(320, 44)}
      <View style={{ flexDirection: 'row', marginTop: px(40) }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ marginRight: px(layout.cardGap) }}>
            {block(layout.cardW, layout.cardH)}
          </View>
        ))}
      </View>
    </View>
  );
}


/** Rec detail meta line + "On {service}" when known (ADR-0012). */
function withService(meta: string, card: TitleCard): string {
  const n = cardServiceName(card);
  return n ? [meta, `On ${n}`].filter(Boolean).join('  ·  ') : meta;
}
