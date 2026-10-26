// Title actions sheet (ux-design §5.2) opened with ☰. Tier 1: no slide-in, no Undo toast yet.
import React from 'react';
import { Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import type { TitleCard } from '../core/home';
import { Button } from '../ui/Button';
import { colors, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';

export function ActionsSheet({ card, active, onSeen, onClose }: { card: TitleCard; active: boolean; onSeen: () => void; onClose: () => void }) {
  useBack(() => {
    onClose();
    return true;
  }, active);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(14,16,32,0.6)' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: px(520), backgroundColor: colors.surface1, paddingHorizontal: px(48), justifyContent: 'center' }}>
        <SpatialNavigationRoot isActive={active}>
          <Text numberOfLines={3} style={type.title}>{card.title}</Text>
          <View style={{ marginTop: px(40) }}>
            <SpatialNavigationNode orientation="vertical">
              <View>
                <DefaultFocus>
                  <Button label="Mark seen" icon="✓" variant="primary" onSelect={onSeen} />
                </DefaultFocus>
                <View style={{ height: px(24) }} />
                <Button label="Cancel" onSelect={onClose} />
              </View>
            </SpatialNavigationNode>
          </View>
        </SpatialNavigationRoot>
      </View>
    </View>
  );
}
