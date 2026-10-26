// Bottom-centre toast (ux §5.5a). Focus never jumps to it; Undo is reached with Down.
import React from 'react';
import { Text, View } from 'react-native';
import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { Button } from '../ui/Button';
import { colors, px, type } from '../ui/theme';

export interface ToastState {
  text: string;
  undo?: { recId: string; title: string };
}

export function Toast({ toast, onUndo, onFocus }: { toast: ToastState; onUndo: () => void; onFocus?: () => void }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: px(48), alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: px(999), paddingLeft: px(36), paddingRight: toast.undo ? px(8) : px(36), height: px(88) }}>
        <Text style={[type.body, { color: colors.text, marginRight: toast.undo ? px(24) : 0 }]}>{toast.text}</Text>
        {toast.undo ? (
          <SpatialNavigationNode orientation="horizontal">
            <View>
              <Button label="Undo" variant="quiet" onSelect={onUndo} onFocus={onFocus} />
            </View>
          </SpatialNavigationNode>
        ) : null}
      </View>
    </View>
  );
}
