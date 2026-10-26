import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/bits';
import { colors, px, type } from '../ui/theme';
import { backdropFor, SCRIM_BOTTOM, SCRIM_LEFT } from '../ui/art';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

/** Full-bleed backdrop with the left + bottom scrims (ux §2.1 "Scrims"). */
export function Backdrop({ title, height = 1080, dim = false }: { title?: string; height?: number; dim?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: px(height) }}>
      <Image source={backdropFor(title)} style={{ position: 'absolute', top: 0, right: 0, width: px(1920 * 0.78), height: px(height) }} resizeMode="cover" />
      <Image source={SCRIM_LEFT} style={{ position: 'absolute', top: 0, left: 0, width: px(1920), height: px(height) }} resizeMode="stretch" />
      <Image source={SCRIM_BOTTOM} style={{ position: 'absolute', left: 0, bottom: 0, width: px(1920), height: px(height * 0.6) }} resizeMode="stretch" />
      {dim && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,16,32,0.55)' }]} />}
    </View>
  );
}

export function BootScreen({ slow }: { slow: boolean }) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Wordmark size={72} />
        </View>
        {slow && <Text style={[type.body, { marginTop: px(32) }]}>Connecting…</Text>}
      </View>
    </Screen>
  );
}

/** "Can't reach Gottawatch" full screen (ux §5.1 offline/error without data). */
export function ErrorScreen({ title, body, action, onAction, detail }: { title: string; body: string; action: string; onAction: () => void; detail?: string }) {
  return (
    <Screen>
      <SpatialNavigationRoot>
        <View style={{ flex: 1, paddingHorizontal: px(96), justifyContent: 'center' }}>
          <Wordmark />
          <Text style={[type.headline, { marginTop: px(64) }]}>{title}</Text>
          <Text style={[type.body, { marginTop: px(16), maxWidth: px(900) }]}>{body}</Text>
          {detail ? <Text style={[type.label, { color: colors.text3, marginTop: px(16) }]}>{detail}</Text> : null}
          <View style={{ flexDirection: 'row', marginTop: px(48) }}>
            <SpatialNavigationNode orientation="horizontal">
              <DefaultFocus>
                <Button label={action} variant="primary" onSelect={onAction} />
              </DefaultFocus>
            </SpatialNavigationNode>
          </View>
        </View>
      </SpatialNavigationRoot>
    </Screen>
  );
}
