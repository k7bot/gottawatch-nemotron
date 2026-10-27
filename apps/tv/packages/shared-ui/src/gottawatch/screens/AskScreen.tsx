// Ask Gottawatch (TV): pick a mood with the remote, Nemotron (on Nebius) answers from your circle's
// picks only. OK on a pick opens the same handoff as Home. No typing: one press per mood.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import { ApiFailure, type ApiClient } from '../core/api';
import { askBackdropTitle, askErrorCopy, askTraceLine, TV_ASK_CHIPS, TV_NO_MATCH_HINT, TV_OFF_TOPIC_HINT, type AskChip, type AskResult } from '../core/ask';
import type { TitleCard } from '../core/home';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { LampDot, Poster, Wordmark } from '../ui/bits';
import { colors, fonts, layout, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';
import { Backdrop, Screen } from './Common';

export type AskState = { k: 'idle' } | { k: 'asking'; chip: AskChip } | { k: 'error'; chip: AskChip; msg: string } | { k: 'ok'; chip: AskChip; r: AskResult };

interface Props {
  api: ApiClient;
  token: string;
  active: boolean;
  cards: TitleCard[];
  /** Kept by the parent so Back from a handoff returns to the same answer. */
  state: AskState;
  setState: (s: AskState) => void;
  onBack: () => void;
  onOpen: (card: TitleCard) => void;
  onUnauthorized: () => void;
}

export function AskScreen({ api, token, active, cards, state, setState, onBack, onOpen, onUnauthorized }: Props) {
  const [slow, setSlow] = useState(false);
  const seq = useRef(0);
  useBack(() => {
    onBack();
    return true;
  }, active);
  useEffect(() => () => void (seq.current += 1), []);

  const ask = useCallback(
    async (chip: AskChip) => {
      const n = ++seq.current;
      setSlow(false);
      setState({ k: 'asking', chip });
      const t = setTimeout(() => n === seq.current && setSlow(true), 4000);
      try {
        const r = await api.ask(token, [chip]);
        if (n === seq.current) setState({ k: 'ok', chip, r });
      } catch (e) {
        if (e instanceof ApiFailure && e.kind === 'unauthorized') return onUnauthorized();
        if (n === seq.current) setState({ k: 'error', chip, msg: askErrorCopy(e) });
      } finally {
        clearTimeout(t);
      }
    },
    [api, token, setState, onUnauthorized],
  );

  const current = state.k === 'idle' ? undefined : state.chip;
  const bg = state.k === 'ok' ? askBackdropTitle(state.r) : undefined;

  return (
    <Screen>
      <Backdrop title={bg} height={1080} dim />
      <SpatialNavigationRoot isActive={active}>
        <SpatialNavigationNode orientation="vertical">
          <View style={{ flex: 1, paddingHorizontal: px(layout.safeX), paddingTop: px(54) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: px(64) }}>
              <Wordmark />
              <View style={{ flex: 1 }} />
              <Text style={type.label}>Back to Home</Text>
            </View>

            <Text style={[type.headline, { marginTop: px(40) }]}>What are you in the mood for?</Text>
            <Text style={[type.body, { marginTop: px(8) }]}>Pick one. Nemotron reads only what your circle sent you, and quotes them word for word.</Text>

            <View style={{ marginTop: px(32) }}>
              <SpatialNavigationNode orientation="horizontal">
                <View style={{ flexDirection: 'row' }}>
                  {TV_ASK_CHIPS.map((c, i) => {
                    const btn = <Button label={c.label} variant={current === c.id ? 'primary' : 'secondary'} onSelect={() => void ask(c.id)} />;
                    return (
                      <View key={c.id} style={{ marginRight: px(20) }}>
                        {(current ? current === c.id : i === 0) ? <DefaultFocus>{btn}</DefaultFocus> : btn}
                      </View>
                    );
                  })}
                </View>
              </SpatialNavigationNode>
            </View>

            <View style={{ marginTop: px(44), flex: 1 }}>
              {state.k === 'idle' && <Text style={type.body}>Try “Short” on a weeknight, or “Together” when everyone's on the couch.</Text>}
              {state.k === 'asking' && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <LampDot />
                  <Text style={[type.title, { marginLeft: px(16), color: colors.text2 }]}>
                    {slow ? 'Still reading the notes…' : "Reading your circle's picks…"}
                  </Text>
                </View>
              )}
              {state.k === 'error' && (
                <View>
                  <Text style={[type.title, { color: colors.text }]}>{state.msg}</Text>
                  <View style={{ flexDirection: 'row', marginTop: px(24) }}>
                    <SpatialNavigationNode orientation="horizontal">
                      <Button label="Try again" icon="↻" onSelect={() => void ask(state.chip)} />
                    </SpatialNavigationNode>
                  </View>
                </View>
              )}
              {state.k === 'ok' && <Answer r={state.r} cards={cards} onOpen={onOpen} />}
            </View>
          </View>
        </SpatialNavigationNode>
      </SpatialNavigationRoot>
    </Screen>
  );
}

// Three cards + gaps fill the 1728px safe width at 1920.
const CARD_W = 552;

function Answer({ r, cards, onOpen }: { r: AskResult; cards: TitleCard[]; onOpen: (c: TitleCard) => void }) {
  const find = (recId: string, title: string) => cards.find((c) => c.recIds.includes(recId)) ?? cards.find((c) => c.title === title);
  const status = r.status ?? 'ok';
  // ok: the picks (first one is the best bet). no_match: at most the closest one, plainly labeled. off_topic: none.
  const shown = status === 'ok' ? r.picks : status === 'no_match' && r.closest ? [r.closest] : [];
  const label = (i: number) => (status !== 'ok' ? 'CLOSEST, NOT AN EXACT MATCH' : i === 0 ? 'BEST BET' : 'ALSO GOOD');
  const lead = (i: number) => status === 'ok' && i === 0;
  // The TV has no keyboard, so an off-topic answer only arrives from a phone-style query; keep the copy TV-true.
  const answer = status === 'off_topic' ? 'I can only help pick something to watch.' : r.answer;
  const hint = status === 'no_match' ? TV_NO_MATCH_HINT : status === 'off_topic' ? TV_OFF_TOPIC_HINT : undefined;
  return (
    <View style={{ flex: 1 }}>
      <Text numberOfLines={2} style={[type.quote, { fontFamily: fonts.display, fontSize: px(40), lineHeight: px(52), maxWidth: px(1500) }]}>{answer}</Text>
      {hint && <Text style={[type.body, { marginTop: px(10), maxWidth: px(1500) }]}>{hint}</Text>}
      {shown.length > 0 && (
        <View style={{ marginTop: px(28) }}>
          <SpatialNavigationNode orientation="horizontal">
            <View style={{ flexDirection: 'row' }}>
              {shown.map((p, i) => {
                const card = find(p.recId, p.title);
                return (
                  <View key={p.recId} style={{ marginRight: px(32) }}>
                    <Focusable radius={layout.radiusPanel} scale={1.03} onSelect={() => card && onOpen(card)} accessibilityLabel={`${p.title}. ${p.reason}`}>
                      {(focused) => (
                        <View
                          style={{
                            width: px(CARD_W),
                            height: px(340),
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: px(20),
                            borderRadius: px(layout.radiusPanel),
                            backgroundColor: focused ? colors.surface2 : colors.surface1,
                            borderWidth: px(3),
                            borderColor: lead(i) ? colors.accent : status === 'ok' ? 'transparent' : colors.surface2,
                          }}
                        >
                          <Poster title={p.title} url={p.poster} width={140} height={210} />
                          <View style={{ flex: 1, alignSelf: 'stretch', marginLeft: px(22) }}>
                            <Text style={[type.label, { color: lead(i) ? colors.accent : colors.text3, fontFamily: fonts.bold, letterSpacing: px(2) }]}>{label(i)}</Text>
                            <Text numberOfLines={1} style={[type.title, { marginTop: px(4), fontSize: px(32), lineHeight: px(40) }]}>{p.title}</Text>
                            <Text numberOfLines={1} style={[type.label, { marginTop: px(2) }]}>
                              {[p.runtime ? `${p.runtime} min` : '', p.from.length ? `From ${p.from.join(' & ')}` : ''].filter(Boolean).join(' · ')}
                            </Text>
                            <Text numberOfLines={p.quotes[0] ? 3 : 5} style={[type.body, { marginTop: px(10), fontSize: px(24), lineHeight: px(32), color: colors.text }]}>{p.reason}</Text>
                            {p.quotes[0] ? (
                              <Text numberOfLines={2} style={[type.body, { marginTop: px(8), fontSize: px(24), lineHeight: px(32) }]}>“{p.quotes[0]}”</Text>
                            ) : null}
                          </View>
                        </View>
                      )}
                    </Focusable>
                  </View>
                );
              })}
            </View>
          </SpatialNavigationNode>
        </View>
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: px(48) }}>
        <Text style={[type.label, { color: colors.text3 }]}>{askTraceLine(r)}</Text>
      </View>
    </View>
  );
}
