// Gottawatch TV-01 hello-world screen (replaces the sample's navigator as the
// app's first screen until TV-04/TV-06 build the real navigation shell).
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationRoot } from 'react-tv-space-navigation';
import FocusablePressable from '../components/FocusablePressable';
import { colors } from '../theme/colors';
import { scaledPixels } from '../hooks/useScale';

export default function GottawatchHelloScreen() {
  const [presses, setPresses] = useState(0);
  return (
    <SpatialNavigationRoot>
      <View style={styles.container}>
        <Text style={styles.wordmark}>Gottawatch</Text>
        <DefaultFocus>
          <FocusablePressable
            text="Hello from Gottawatch"
            onSelect={() => setPresses((n) => n + 1)}
            style={styles.button}
          />
        </DefaultFocus>
        <Text style={styles.hint}>
          {presses === 0
            ? 'Press OK on your remote'
            : `OK pressed ${presses} time${presses === 1 ? '' : 's'}`}
        </Text>
      </View>
    </SpatialNavigationRoot>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: colors.text,
    fontSize: scaledPixels(72),
    fontWeight: 'bold',
    marginBottom: scaledPixels(48),
  },
  button: {
    alignSelf: 'center',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: scaledPixels(28),
    marginTop: scaledPixels(32),
  },
});
