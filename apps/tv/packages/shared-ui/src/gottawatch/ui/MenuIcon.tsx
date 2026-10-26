import React from 'react';
import { View } from 'react-native';
import { px } from './theme';

/** ☰ drawn with Views (Inter has no U+2630). */
export function MenuIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bar = { height: px(3), backgroundColor: color, borderRadius: px(2), width: px(size) };
  return (
    <View style={{ height: px(size * 0.8), justifyContent: 'space-between', marginHorizontal: px(6) }}>
      <View style={bar} />
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}
