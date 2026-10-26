// Evening Circle tokens (ux-design §2). All sizes are 1920×1080 layout px passed through px().
import { scaledPixels } from '../../hooks/useScale';
import type { TextStyle } from 'react-native';
import type { FriendHue } from '../core/home';

export const px = (n: number) => scaledPixels(n);

export const colors = {
  bg: '#0E1020',
  surface1: '#171A2E',
  surface2: '#23273F',
  text: '#F4F1EA',
  text2: '#BFC2D6',
  text3: '#9A9EB8',
  accent: '#F2B45A',
  focus: '#FFFFFF',
  danger: '#F59A8E',
} as const;

export const friendColors: Record<FriendHue, string> = {
  sky: '#86BDEB',
  sage: '#9ED3A9',
  lilac: '#D4A9E0',
  coral: '#F08F7F',
};

// Static TTFs, one family name per weight (Android API 25 can't use variable axes; MF-10).
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  display: 'Fraunces-SemiBold',
  /** Brand wordmark only, matching the phone app (Plus Jakarta Sans ExtraBold). */
  brand: 'PlusJakartaSans-ExtraBold',
} as const;

export const fontAssets = {
  'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
  'Fraunces-SemiBold': require('../../assets/fonts/Fraunces-SemiBold.ttf'),
  'PlusJakartaSans-ExtraBold': require('../../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
};

const t = (fontFamily: string, size: number, line: number, extra: TextStyle = {}): TextStyle => ({
  fontFamily,
  fontSize: px(size),
  lineHeight: px(line),
  color: colors.text,
  ...extra,
});

// TV type scale (ux-design §2.2). Floor: no TV text < 24 px.
export const type = {
  display: t(fonts.display, 76, 84),
  headline: t(fonts.display, 52, 60),
  wordmark: t(fonts.brand, 40, 48),
  title: t(fonts.semibold, 36, 44),
  quote: t(fonts.medium, 34, 48),
  body: t(fonts.regular, 28, 40, { color: colors.text2 }),
  label: t(fonts.semibold, 24, 32, { letterSpacing: px(0.5), color: colors.text2 }),
  code: t(fonts.bold, 112, 120, { letterSpacing: px(9), fontVariant: ['tabular-nums'] }),
} satisfies Record<string, TextStyle>;

export const layout = {
  safeX: 96,
  safeY: 54,
  cardW: 200,
  cardH: 300,
  cardGap: 32,
  radiusCard: 16,
  radiusPanel: 24,
};
