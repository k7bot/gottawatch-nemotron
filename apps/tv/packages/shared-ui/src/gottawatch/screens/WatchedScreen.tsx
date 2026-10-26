// Watched history (ux §5.5a): newest first, one row per title, [Put back] returns it to the feed.
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot, SpatialNavigationVirtualizedList } from 'react-tv-space-navigation';
import { ApiFailure, type ApiClient, type SeenItem } from '../core/api';
import { watchedLine } from '../core/home';
import { Button } from '../ui/Button';
import { Poster, Wordmark } from '../ui/bits';
import { colors, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';
import { Screen } from './Common';

interface Props {
  api: ApiClient;
  token: string;
  active: boolean;
  onBack: () => void;
  onPutBack: (recId: string, title: string) => Promise<boolean>;
  onUnauthorized: () => void;
}

const ROW_H = 168;

export function WatchedScreen({ api, token, active, onBack, onPutBack, onUnauthorized }: Props) {
  const [state, setState] = useState<{ k: 'loading' } | { k: 'ok'; items: SeenItem[] } | { k: 'err' }>({ k: 'loading' });
  const [note, setNote] = useState<string | null>(null);
  useBack(() => {
    onBack();
    return true;
  }, active);
  const load = useCallback(async () => {
    try {
      setState({ k: 'ok', items: await api.seenHistory(token, 50) });
    } catch (e) {
      if (e instanceof ApiFailure && e.kind === 'unauthorized') return onUnauthorized();
      setState({ k: 'err' });
    }
  }, [api, token, onUnauthorized]);
  useEffect(() => void load(), [load]);
  const now = Date.now();

  const putBack = async (it: SeenItem) => {
    const ok = await onPutBack(it.id, it.title);
    setNote(ok ? `${it.title} is back in your list` : "Couldn't put it back. Try again.");
    if (ok) setState((p) => (p.k === 'ok' ? { k: 'ok', items: p.items.filter((x) => x.title !== it.title) } : p));
  };

  return (
    <Screen>
      <SpatialNavigationRoot isActive={active}>
        <View style={{ flex: 1, paddingHorizontal: px(96), paddingTop: px(54) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Wordmark />
            <View style={{ flex: 1 }} />
            {note ? <Text style={[type.label, { color: colors.text, marginRight: px(24) }]}>{note}</Text> : null}
          </View>
          <Text style={[type.headline, { marginTop: px(40) }]}>Watched</Text>
          <Text style={[type.body, { marginTop: px(8), marginBottom: px(24) }]}>Titles you marked as seen. Put one back to see it on Home again.</Text>
          {state.k === 'loading' ? (
            <Text style={type.body}>Loading…</Text>
          ) : state.k === 'err' ? (
            <View>
              <Text style={type.body}>Couldn't load your watched titles.</Text>
              <View style={{ flexDirection: 'row', marginTop: px(24) }}>
                <SpatialNavigationNode orientation="horizontal">
                  <View style={{ flexDirection: 'row' }}>
                    <DefaultFocus>
                      <Button label="Try again" variant="primary" onSelect={() => void load()} />
                    </DefaultFocus>
                    <View style={{ width: px(24) }} />
                    <Button label="Back" onSelect={onBack} />
                  </View>
                </SpatialNavigationNode>
              </View>
            </View>
          ) : state.items.length === 0 ? (
            <View>
              <Text style={type.body}>Nothing watched yet. Titles you mark as seen show up here.</Text>
              <View style={{ flexDirection: 'row', marginTop: px(24) }}>
                <SpatialNavigationNode orientation="horizontal">
                  <DefaultFocus>
                    <Button label="Back" variant="primary" onSelect={onBack} />
                  </DefaultFocus>
                </SpatialNavigationNode>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <SpatialNavigationVirtualizedList
                orientation="vertical"
                data={state.items}
                itemSize={px(ROW_H)}
                additionalItemsRendered={3}
                scrollDuration={0}
                renderItem={({ item, index }: { item: SeenItem; index: number }) => {
                  const btn = <Button label="Put back" icon="↩" onSelect={() => void putBack(item)} />;
                  return (
                    <View style={{ height: px(ROW_H), flexDirection: 'row', alignItems: 'center' }}>
                      <Poster title={item.title} url={item.poster} width={96} height={144} />
                      <View style={{ marginLeft: px(32), width: px(1000) }}>
                        <Text numberOfLines={1} style={type.title}>{item.title}</Text>
                        <Text style={[type.label, { marginTop: px(8) }]}>{watchedLine(item.from.displayName, item.seenAt, now)}</Text>
                      </View>
                      <SpatialNavigationNode orientation="horizontal">
                        <View>{index === 0 ? <DefaultFocus>{btn}</DefaultFocus> : btn}</View>
                      </SpatialNavigationNode>
                    </View>
                  );
                }}
              />
            </View>
          )}
        </View>
      </SpatialNavigationRoot>
    </Screen>
  );
}
