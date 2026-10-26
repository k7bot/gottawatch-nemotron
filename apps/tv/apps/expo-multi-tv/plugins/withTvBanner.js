// Full-bleed 16:9 TV banner (320x180 @xhdpi; navy, eye + two-tone wordmark pre-rendered to PNG).
// Copies per-density PNGs from assets/tv_icons/banner/<dpi>.png and sets android:banner on
// <application> AND the launcher activity, so Fire TV's app row never letterboxes the square icon.
// Runs after @react-native-tvos/config-tv (which copied one non-16:9 image to every density).
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DPIS = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

const withBannerFiles = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const root = config.modRequest.projectRoot;
      const res = path.join(config.modRequest.platformProjectRoot, "app/src/main/res");
      for (const dpi of DPIS) {
        const src = path.join(root, "assets/tv_icons/banner", `${dpi}.png`);
        const dir = path.join(res, `drawable-${dpi}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(src, path.join(dir, "tv_banner.png"));
      }
      // Fire OS shows SIDELOADED apps with android:icon (square, centered on grey padding) and ignores
      // android:banner; a full-bleed tile only comes from Amazon Appstore assets. So the square launcher
      // icon carries the brand: eye + stacked two-tone wordmark, pre-rendered PNGs (no device fonts).
      // Legacy PNGs for every density; the adaptive anydpi-v26 XML is dropped so Fire OS 7+ uses them too.
      for (const dpi of DPIS) {
        const src = path.join(root, "assets/tv_icons/launcher", `${dpi}.png`);
        const dir = path.join(res, `mipmap-${dpi}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const f of fs.readdirSync(dir)) if (/^ic_launcher(_round)?\.(webp|png)$/.test(f)) fs.unlinkSync(path.join(dir, f));
        fs.copyFileSync(src, path.join(dir, "ic_launcher.png"));
        fs.copyFileSync(src, path.join(dir, "ic_launcher_round.png"));
      }
      const anydpi = path.join(res, "mipmap-anydpi-v26");
      for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
        const fp = path.join(anydpi, f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      // A density-less copy would win on no device but can confuse; drop it.
      const plain = path.join(res, "drawable/tv_banner.png");
      if (fs.existsSync(plain)) fs.unlinkSync(plain);
      return config;
    },
  ]);

const withBannerManifest = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (!app) return config;
    app.$["android:banner"] = "@drawable/tv_banner";
    for (const a of app.activity ?? []) {
      const launcher = (a["intent-filter"] ?? []).some((f) =>
        (f.category ?? []).some((c) => /LAUNCHER/.test(c.$["android:name"])),
      );
      if (launcher) a.$["android:banner"] = "@drawable/tv_banner";
    }
    return config;
  });

module.exports = (config) => withBannerManifest(withBannerFiles(config));
