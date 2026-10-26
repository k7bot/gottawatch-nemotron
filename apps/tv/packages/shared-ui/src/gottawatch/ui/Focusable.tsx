// Focus treatment (ux-design §2.6, ADR-0009 Tier 1): scale + double ring (4 px bg gap + 4 px white).
// No glow/shadow (API 25, MF-1). No animation in Tier 1: the state changes instantly.
// Select (OK / click) is handled by SpatialNavigationFocusableView's onSelect.
import React, { forwardRef } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { SpatialNavigationFocusableView, type SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { colors, px } from './theme';

interface Props {
  onSelect?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  radius: number;
  scale?: number;
  style?: ViewStyle;
  children: (focused: boolean) => React.ReactNode;
  accessibilityLabel?: string;
}

export const RING = 4;

export const Focusable = forwardRef<SpatialNavigationNodeRef, Props>(function Focusable(
  { onSelect, onFocus, onBlur, radius, scale = 1.05, style, children, accessibilityLabel },
  ref,
) {
  return (
    <SpatialNavigationFocusableView ref={ref} onSelect={onSelect} onFocus={onFocus} onBlur={onBlur}>
      {({ isFocused }) => (
        <View
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected: isFocused }}
          style={[style, isFocused && { transform: [{ scale }] }]}
        >
          {children(isFocused)}
          {isFocused && <FocusRing radius={radius} />}
        </View>
      )}
    </SpatialNavigationFocusableView>
  );
});

export function FocusRing({ radius }: { radius: number }) {
  const g = px(RING);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { margin: -2 * g }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: px(radius) + 2 * g, borderWidth: g, borderColor: colors.focus }]} />
      <View style={[StyleSheet.absoluteFill, { margin: g, borderRadius: px(radius) + g, borderWidth: g, borderColor: colors.bg }]} />
    </View>
  );
}
