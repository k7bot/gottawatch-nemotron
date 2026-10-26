// About (ux-design §5.5): version, household, paired since, attribution note, demo-grade note, Unpair.
import { peopleLabel } from '../core/home';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import type { WcConfig } from '../core/config';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/bits';
import { colors, px, type } from '../ui/theme';
import { useBack } from '../ui/keys';
import { Screen } from './Common';

const TMDB_LOGO: number = require('../../assets/art/tmdb-logo.png');
const TMDB_NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

interface Props {
  config: WcConfig;
  householdName?: string;
  pairedAt?: number;
  paired: boolean;
  active: boolean;
  onBack: () => void;
  onUnpair: () => void;
}

export function AboutScreen({ config, householdName, pairedAt, paired, active, onBack, onUnpair }: Props) {
  const [confirm, setConfirm] = useState(false);
  useBack(() => {
    if (confirm) setConfirm(false);
    else onBack();
    return true;
  }, active);
  const version = Constants.expoConfig?.version ?? '?';
  const since = pairedAt ? new Date(pairedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined;
  const row = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', marginTop: px(16) }}>
      <Text style={[type.body, { width: px(320), color: colors.text3 }]}>{label}</Text>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{value}</Text>
    </View>
  );
  return (
    <Screen>
      <SpatialNavigationRoot isActive={active}>
        <View style={{ flex: 1, paddingHorizontal: px(96), paddingVertical: px(54) }}>
          <Wordmark />
          <Text style={[type.headline, { marginTop: px(48) }]}>About</Text>
          <View style={{ marginTop: px(24), maxWidth: px(1300) }}>
            {row('Version', `Gottawatch ${version} (${config.apiMode === 'mock' ? 'demo data' : 'live'})`)}
            {row('Paired with', paired ? (householdName ? peopleLabel(householdName) : 'Paired') : 'Not paired yet')}
            {since ? row('Paired since', since) : null}
            {row('Shows and movies', 'Show and movie info and posters from TMDB. Where-to-watch info by JustWatch.')}
            {row('Sign-in', 'Demo-grade sign-in for the hackathon. No passwords, no personal data beyond first names.')}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: px(40) }}>
            <Image source={TMDB_LOGO} accessibilityLabel="TMDB" style={{ width: px(200), height: px(26) }} resizeMode="contain" />
            <Text style={[type.body, { marginLeft: px(24), color: colors.text3, flex: 1 }]}>{TMDB_NOTICE}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {confirm ? (
            <View style={{ backgroundColor: colors.surface1, borderRadius: px(24), padding: px(40), alignSelf: 'flex-start' }}>
              <Text style={type.title}>Unpair this TV?</Text>
              <Text style={[type.body, { marginTop: px(8) }]}>You'll need your phone to pair it again.</Text>
              <View style={{ flexDirection: 'row', marginTop: px(32) }}>
                <SpatialNavigationNode orientation="horizontal">
                  <View style={{ flexDirection: 'row' }}>
                    <Button label="Unpair" onSelect={onUnpair} />
                    <View style={{ width: px(24) }} />
                    <DefaultFocus>
                      <Button label="Cancel" variant="primary" onSelect={() => setConfirm(false)} />
                    </DefaultFocus>
                  </View>
                </SpatialNavigationNode>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <SpatialNavigationNode orientation="horizontal">
                <View style={{ flexDirection: 'row' }}>
                  <DefaultFocus>
                    <Button label="Back" variant="primary" onSelect={onBack} />
                  </DefaultFocus>
                  {paired && (
                    <>
                      <View style={{ width: px(24) }} />
                      <Button label="Unpair this TV" onSelect={() => setConfirm(true)} />
                    </>
                  )}
                </View>
              </SpatialNavigationNode>
            </View>
          )}
        </View>
      </SpatialNavigationRoot>
    </Screen>
  );
}
