// QR rendered with plain Views (no SVG dependency): one row of horizontal runs per module row.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';
import { px } from './theme';

export function QrCode({ value, size }: { value: string; size: number }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { start: number; len: number }[][] = [];
    for (let r = 0; r < n; r++) {
      const runs: { start: number; len: number }[] = [];
      let c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          const start = c;
          while (c < n && qr.isDark(r, c)) c++;
          runs.push({ start, len: c - start });
        } else c++;
      }
      out.push(runs);
    }
    return { n, out };
  }, [value]);
  const m = px(size) / rows.n;
  return (
    <View accessibilityLabel="Pairing QR code" style={{ width: px(size), height: px(size), backgroundColor: '#FFFFFF' }}>
      {rows.out.map((runs, r) =>
        runs.map((run) => (
          <View
            key={`${r}-${run.start}`}
            style={{ position: 'absolute', top: r * m, left: run.start * m, width: run.len * m + 0.5, height: m + 0.5, backgroundColor: '#000000' }}
          />
        )),
      )}
    </View>
  );
}
