// Small presentational pieces: Avatar, AvatarStack, Pill, Poster, Wordmark.
import React, { useEffect, useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { friendHue, initials } from '../core/home';
import { colors, fonts, friendColors, px, type } from './theme';
import { posterFor } from './art';

export function Avatar({ id, name, size = 48 }: { id: string; name: string; size?: number }) {
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: px(size),
        height: px(size),
        borderRadius: px(size / 2),
        backgroundColor: friendColors[friendHue(id)],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: px(3),
        borderColor: colors.bg,
      }}
    >
      <Text style={{ color: colors.bg, fontFamily: fonts.bold, fontSize: px(Math.max(22, size * 0.42)) }}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ people, size = 48 }: { people: { id: string; name: string }[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.slice(0, 3).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -px(size * 0.3) }}>
          <Avatar id={p.id} name={p.name} size={size} />
        </View>
      ))}
    </View>
  );
}

export function Pill({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'surface' | 'dev' }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'dev' ? colors.danger : colors.surface2;
  const fg = tone === 'surface' ? colors.text : colors.bg;
  return (
    <View style={{ backgroundColor: bg, borderRadius: px(999), paddingHorizontal: px(14), height: px(36), justifyContent: 'center' }}>
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: px(24), lineHeight: px(30), letterSpacing: px(0.5) }}>{label}</Text>
    </View>
  );
}

/** TMDB posters are stored at w342; small rows ask for w185 (Fire OS 6 sticks have little RAM). */
export function tvPosterUrl(url: string | undefined, width: number): string | undefined {
  if (!url) return undefined;
  const size = width <= 140 ? 'w185' : 'w342';
  return url.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//, `$1${size}/`);
}

/**
 * Poster: a remote (TMDB) poster when the rec carries one, else bundled pre-rendered art for the demo
 * catalog, else the generic fallback with the title on top. A failed remote load falls back too.
 * Android's image pipeline caches remote posters on disk, so revisits don't refetch.
 */
export function Poster({ title, width, height, url }: { title: string; width: number; height: number; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const remote = failed ? undefined : tvPosterUrl(url, width);
  const local = posterFor(title);
  const source: ImageSourcePropType = remote ? { uri: remote, cache: 'force-cache' } : (local.source as ImageSourcePropType);
  const showTitle = !remote && local.isFallback;
  return (
    <View style={{ width: px(width), height: px(height), borderRadius: px(16), overflow: 'hidden', backgroundColor: colors.surface1 }}>
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        fadeDuration={0}
        accessibilityLabel={title}
        onError={remote ? () => setFailed(true) : undefined}
      />
      {showTitle && (
        <View style={{ position: 'absolute', left: px(16), right: px(16), bottom: px(20) }}>
          <Text numberOfLines={3} style={{ fontFamily: fonts.display, fontSize: px(Math.round(width / 7.5)), lineHeight: px(Math.round(width / 6.2)), color: colors.text }}>
            {title}
          </Text>
        </View>
      )}
    </View>
  );
}

const EYE_MARK: number = require('../../assets/art/eye-mark.png');

/**
 * Brand lockup: eye mark + two-tone wordmark, always together (Kiran, Oct 14). `size` = wordmark
 * font size in TV px; the eye is 0.8× that tall with a 0.3× gap, so every screen scales the same.
 */
export function BrandLockup({ size = 40 }: { size?: number }) {
  const eyeH = Math.round(size * 0.8);
  return (
    <View accessible accessibilityLabel="Gottawatch" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image source={EYE_MARK as ImageSourcePropType} style={{ width: px(Math.round((eyeH * 832) / 504)), height: px(eyeH), marginRight: px(Math.round(size * 0.3)) }} resizeMode="contain" fadeDuration={0} />
      <Text style={[type.wordmark, { fontSize: px(size), lineHeight: px(size * 1.2), letterSpacing: -0.02 * px(size) }]}>
        Gotta<Text style={{ color: colors.accent }}>watch</Text>
      </Text>
    </View>
  );
}
/** Kept for existing call sites: the wordmark is never shown without the eye. */
export const Wordmark = BrandLockup;

export function LampDot() {
  return <View style={{ width: px(14), height: px(14), borderRadius: px(7), backgroundColor: colors.accent, marginRight: px(12) }} />;
}
