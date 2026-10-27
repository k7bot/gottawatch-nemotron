// Ask Gottawatch (TV): pick a mood with the remote, or type your own question with the on-screen
// keyboard. Nemotron (on Nebius) answers from your circle's picks only. OK on a pick opens the same
// handoff as Home.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Text, TextInput, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { ApiFailure, type ApiClient } from '../core/api';
import {
  ASK_QUERY_MAX,
  askBackdropTitle,
  askFocusAfter,
  askedLine,
  askErrorCopy,
  askTraceLine,
  typedQuery,
  typingHint,
  TV_ASK_CHIPS,
  TV_NO_MATCH_HINT,
  TV_OFF_TOPIC_HINT,
  type AskInput,
  type AskResult,
} from '../core/ask';
import type { TitleCard } from '../core/home';
import { Button } from '../ui/Button';
import { Focusable } from '../ui/Focusable';
import { LampDot, Poster, Wordmark } from '../ui/bits';
import { colors, fonts, layout, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';
import { Backdrop, Screen } from './Common';

export type AskState = { k: 'idle' } | { k: 'asking'; input: AskInput } | { k: 'error'; input: AskInput; msg: string } | { k: 'ok'; input: AskInput; r: AskResult };

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

const TYPED = 'typed';
const later = (f: () => void) => setTimeout(f, 60); // after the root is active again

export function AskScreen({ api, token, active, cards, state, setState, onBack, onOpen, onUnauthorized }: Props) {
  const [slow, setSlow] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const seq = useRef(0);
  const tileRef = useRef<SpatialNavigationNodeRef>(null);
  const inputRef = useRef<TextInput>(null);

  const stopTyping = useCallback(() => {
    setTyping(false);
    later(() => tileRef.current?.focus());
  }, []);
  useBack(() => {
    if (typing) {
      stopTyping();
      return true;
    }
    onBack();
    return true;
  }, active);
  useEffect(() => () => void (seq.current += 1), []);
  // Fire TV: Back closes the on-screen keyboard first (the IME eats that press). Treat a keyboard
  // closed without Done as "cancel", so one Back returns to the tile. The draft is kept for next time.
  useEffect(() => {
    if (!typing || Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidHide', stopTyping);
    return () => sub.remove();
  }, [typing, stopTyping]);

  const ask = useCallback(
    async (input: AskInput) => {
      const n = ++seq.current;
      setSlow(false);
      setState({ k: 'asking', input });
      const t = setTimeout(() => n === seq.current && setSlow(true), 4000);
      try {
        const r = input.query ? await api.ask(token, [], input.query) : await api.ask(token, [input.chip!]);
        if (n !== seq.current) return;
        setState({ k: 'ok', input, r });
        // Typed question (ok, no_match or off_topic): keep focus on the tile so OK rephrases.
        if (askFocusAfter(input) === TYPED) later(() => tileRef.current?.focus());
      } catch (e) {
        if (e instanceof ApiFailure && e.kind === 'unauthorized') return onUnauthorized();
        if (n === seq.current) setState({ k: 'error', input, msg: askErrorCopy(e) });
      } finally {
        clearTimeout(t);
      }
    },
    [api, token, setState, onUnauthorized],
  );

  const submit = () => {
    const q = typedQuery(draft);
    if (!q) return; // empty submit does nothing; the field stays open
    setTyping(false);
    later(() => tileRef.current?.focus());
    void ask({ query: q });
  };

  const input = state.k === 'idle' ? undefined : state.input;
  const current = typing ? TYPED : input ? (input.query ? TYPED : input.chip) : undefined;
  const bg = state.k === 'ok' && !typing ? askBackdropTitle(state.r) : undefined;
  const asked = askedLine(input);

  return (
    <Screen>
      <Backdrop title={bg} height={1080} dim />
      <SpatialNavigationRoot isActive={active && !typing}>
        <SpatialNavigationNode orientation="vertical">
          <View style={{ flex: 1, paddingHorizontal: px(layout.safeX), paddingTop: px(54) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: px(64) }}>
              <Wordmark />
              <View style={{ flex: 1 }} />
              <Text style={type.label}>Back to Home</Text>
            </View>

            <Text style={[type.headline, { marginTop: px(40) }]}>What are you in the mood for?</Text>
            <Text style={[type.body, { marginTop: px(8) }]}>Pick one, or type your own. Nemotron reads only what your circle sent you, and quotes them word for word.</Text>

            <View style={{ marginTop: px(32) }}>
              <SpatialNavigationNode orientation="horizontal">
                <View style={{ flexDirection: 'row' }}>
                  {TV_ASK_CHIPS.map((c, i) => {
                    const btn = <Button label={c.label} variant={current === c.id ? 'primary' : 'secondary'} onSelect={() => void ask({ chip: c.id })} />;
                    return (
                      <View key={c.id} style={{ marginRight: px(20) }}>
                        <DefaultFocus enable={current ? current === c.id : i === 0}>{btn}</DefaultFocus>
                      </View>
                    );
                  })}
                  {/* Always wrapped (enable toggles) so the tile never remounts and drops focus. */}
                  <DefaultFocus enable={current === TYPED}>
                    <TypeTile ref={tileRef} selected={current === TYPED} onSelect={() => setTyping(true)} />
                  </DefaultFocus>
                </View>
              </SpatialNavigationNode>
            </View>

            <View style={{ marginTop: px(44), flex: 1 }}>
              {typing && (
                <View>
                  <Text style={[type.label, { color: colors.text }]}>Ask in your own words</Text>
                  <View
                    style={{
                      marginTop: px(14),
                      height: px(104),
                      maxWidth: px(1500),
                      justifyContent: 'center',
                      paddingHorizontal: px(32),
                      borderRadius: px(layout.radiusPanel),
                      backgroundColor: colors.surface1,
                      borderWidth: px(4),
                      borderColor: colors.focus,
                    }}
                  >
                    <TextInput
                      ref={inputRef}
                      autoFocus
                      value={draft}
                      onChangeText={setDraft}
                      maxLength={ASK_QUERY_MAX}
                      placeholder="Something spooky but cozy, or what did Priya send?"
                      placeholderTextColor={colors.text3}
                      returnKeyType="done"
                      enterKeyHint="done"
                      submitBehavior="submit"
                      blurOnSubmit={false}
                      onSubmitEditing={submit}
                      // Web preview: the field keeps its keys (react-native-web stops them reaching the
                      // remote handler), so Esc is handled here. Fire TV: Back closes the keyboard (above).
                      onKeyPress={(e) => e.nativeEvent.key === 'Escape' && stopTyping()}
                      // The last question comes back selected: type to replace it, or edit it.
                      selectTextOnFocus
                      accessibilityLabel="Type your question"
                      selectionColor={colors.accent}
                      style={[{ color: colors.text, fontFamily: fonts.medium, fontSize: px(36), lineHeight: px(48), padding: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                    />
                  </View>
                  <Text style={[type.label, { marginTop: px(16), color: colors.text3 }]}>{typingHint(Platform.OS, draft.length)}</Text>
                </View>
              )}
              {!typing && state.k === 'idle' && <Text style={type.body}>Try “Short” on a weeknight, or “Together” when everyone's on the couch.</Text>}
              {!typing && state.k !== 'idle' && asked && (
                <Text numberOfLines={1} style={[type.label, { color: colors.text3, marginBottom: px(12), maxWidth: px(1500) }]}>{asked}</Text>
              )}
              {!typing && state.k === 'asking' && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <LampDot />
                  <Text style={[type.title, { marginLeft: px(16), color: colors.text2 }]}>
                    {slow ? 'Still reading the notes…' : "Reading your circle's picks…"}
                  </Text>
                </View>
              )}
              {!typing && state.k === 'error' && (
                <View>
                  <Text style={[type.title, { color: colors.text }]}>{state.msg}</Text>
                  <View style={{ flexDirection: 'row', marginTop: px(24) }}>
                    <SpatialNavigationNode orientation="horizontal">
                      <Button label="Try again" icon="↻" onSelect={() => void ask(state.input)} />
                    </SpatialNavigationNode>
                  </View>
                </View>
              )}
              {!typing && state.k === 'ok' && <Answer r={state.r} cards={cards} onOpen={onOpen} />}
            </View>
          </View>
        </SpatialNavigationNode>
      </SpatialNavigationRoot>
    </Screen>
  );
}

/** "Type your own…" tile: same pill as the mood chips, with a small drawn keyboard (no icon font needed on the stick). */
const TypeTile = React.forwardRef<SpatialNavigationNodeRef, { selected: boolean; onSelect: () => void }>(function TypeTile({ selected, onSelect }, ref) {
  return (
    <Focusable ref={ref} radius={999} onSelect={onSelect} accessibilityLabel="Type your own question">
      {(focused) => {
        const fg = selected || focused ? colors.bg : colors.text;
        const bg = selected ? colors.accent : focused ? colors.focus : colors.surface2;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', height: px(72), paddingHorizontal: px(32), borderRadius: px(999), backgroundColor: bg }}>
            <KeyboardIcon color={fg} />
            <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: px(28), lineHeight: px(36), marginLeft: px(14) }}>Type your own…</Text>
          </View>
        );
      }}
    </Focusable>
  );
});

function KeyboardIcon({ color }: { color: string }) {
  const key = { width: px(4), height: px(4), borderRadius: px(1), backgroundColor: color, marginHorizontal: px(1) };
  const row = (n: number) => (
    <View style={{ flexDirection: 'row', marginTop: px(2.5) }}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={key} />)}
    </View>
  );
  return (
    <View style={{ width: px(38), height: px(26), borderRadius: px(5), borderWidth: px(2.5), borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {row(5)}
      {row(5)}
      <View style={{ width: px(18), height: px(3.5), borderRadius: px(1), backgroundColor: color, marginTop: px(2.5), marginBottom: px(1) }} />
    </View>
  );
}

// Three cards + gaps fill the 1728px safe width at 1920.
const CARD_W = 552;
// The lone "closest" card is wider so its label stays on one line.
const CLOSEST_W = 760;

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
                            width: px(status === 'ok' ? CARD_W : CLOSEST_W),
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
