import React, { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { Focusable } from './Focusable';
import { colors, fonts, px } from './theme';

interface Props {
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  onSelect: () => void;
  onFocus?: () => void;
}

/** Pill button. Focused text switches to bg on a white/marigold fill (ux §2.6 d). */
export const Button = forwardRef<SpatialNavigationNodeRef, Props>(function Button(
  { label, icon, variant = 'secondary', onSelect, onFocus },
  ref,
) {
  return (
    <Focusable ref={ref} radius={999} onSelect={onSelect} onFocus={onFocus} accessibilityLabel={label}>
      {(focused) => {
        const bg = variant === 'primary' ? colors.accent : focused ? colors.focus : variant === 'quiet' ? 'transparent' : colors.surface2;
        const fg = variant === 'primary' || focused ? colors.bg : colors.text;
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: px(72),
              paddingHorizontal: px(36),
              borderRadius: px(999),
              backgroundColor: bg,
              borderWidth: variant === 'quiet' && !focused ? px(2) : 0,
              borderColor: colors.text3,
            }}
          >
            {icon ? <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: px(28), marginRight: px(14) }}>{icon}</Text> : null}
            <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: px(28), lineHeight: px(36) }}>{label}</Text>
          </View>
        );
      }}
    </Focusable>
  );
});
