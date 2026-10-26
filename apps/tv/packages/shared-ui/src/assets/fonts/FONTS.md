# Bundled fonts (UX-02, ADR-0009: Inter + Fraunces SemiBold, static TTFs, Tier 1)

| File | Source | Version | License |
|---|---|---|---|
| Inter-Regular/Medium/SemiBold/Bold.ttf | https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip (`extras/ttf/`) | 4.1 | SIL OFL 1.1, see `Inter-OFL.txt` |
| Fraunces-SemiBold.ttf | https://github.com/undercasetype/Fraunces/releases/download/1.000/UnderCaseType_Fraunces_1.000.zip (`static/ttf/Fraunces72pt-SemiBold.ttf`, the 72 pt optical size, for display text ≥ 48 px) | 1.000 | SIL OFL 1.1, see `Fraunces-OFL.txt` (from the Fraunces repo; the release zip ships no license file) |

**License check (2026-10-11):** read both license files. Both are SIL OFL 1.1 and **neither declares a Reserved Font Name**, so subsetting (a "Modified Version") may keep the original names. Bundling in an app is allowed under OFL §2 as long as the license travels with the fonts (these files) and the fonts aren't sold by themselves.

**Subset** (fontTools 4.65, to keep the APK small; total ≈ 268 KB vs ≈ 1.7 MB unsubset, under the ADR-0009 1 MB budget):
```
U="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2190-2193,U+2022,U+2026,U+00B7,U+2713,U+2714,U+25B2,U+25B6,U+25BC,U+2630,U+2665,U+00D7"
pyftsubset Inter-<W>.ttf --unicodes="$U" --layout-features='kern,liga,calt,tnum,case' --output-file=Inter-<W>.ttf
pyftsubset Fraunces72pt-SemiBold.ttf --unicodes="$U" --layout-features='kern,liga,calt' --output-file=Fraunces-SemiBold.ttf
```
Inter has no ☰ (U+2630); that glyph falls back to the system font.

Source zip SHA-256:
```
9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e  Inter-4.1.zip
8d8b81dfaeb89433f5c908e1d8d0a4b202bd627bd80d4cd5ff56f311fdcad19f  UnderCaseType_Fraunces_1.000.zip
```
`SpaceMono-Regular.ttf` + `OFL.txt` are from the upstream sample.

| PlusJakartaSans-ExtraBold.ttf | `@expo-google-fonts/plus-jakarta-sans` 0.4.x (`800ExtraBold/PlusJakartaSans_800ExtraBold.ttf`, static), same file the phone app uses | Google Fonts | SIL OFL 1.1 (https://github.com/tokotype/PlusJakartaSans/blob/master/OFL.txt). Used only for the brand wordmark. |
