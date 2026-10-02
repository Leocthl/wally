// What must stay true of the native shells: sealed config (no server, no cleartext), one app id everywhere, colours equal
// to the design tokens, and no signing material or banned wording in the committed native sources.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../capacitor.config";
import { BG_DARK, BG_LIGHT } from "../scripts/colors.mjs";

const MOBILE = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(join(MOBILE, path), "utf8");

/** Generated or fetched folders: build outputs, the web copy, dependencies. */
const SKIP = new Set(["node_modules", "www", "build", ".gradle", "Pods", "DerivedData", "public", "xcuserdata", ".idea", "capacitor-cordova-ios-plugins", "capacitor-cordova-android-plugins"]);
const TEXT = /\.(swift|plist|storyboard|pbxproj|xcconfig|json|xml|gradle|properties|java|kt|md|ts|mjs|yaml|yml|txt|pro|xcscheme|entitlements)$/;

function sources(dir: string): string[] {
  return readdirSync(join(MOBILE, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (SKIP.has(name)) return [];
    return statSync(join(MOBILE, rel)).isDirectory() ? sources(rel) : [rel];
  });
}

const native = [...sources("ios"), ...sources("android")];

describe("capacitor.config", () => {
  it("serves the bundled files only: no server url, no cleartext, https scheme on Android", () => {
    expect(config.appId).toBe("app.wally.demo");
    expect(config.appName).toBe("Wally");
    expect(config.webDir).toBe("www");
    expect(config.server?.url).toBeUndefined();
    expect(config.server?.cleartext).not.toBe(true);
    expect(config.server?.androidScheme).toBe("https");
    expect(config.android?.allowMixedContent).toBe(false);
  });
});

describe("app id", () => {
  it("is the same in the iOS project and the Android project", () => {
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).toContain("PRODUCT_BUNDLE_IDENTIFIER = app.wally.demo;");
    expect(read("android/app/build.gradle")).toContain('applicationId "app.wally.demo"');
    expect(read("android/app/build.gradle")).toContain('namespace = "app.wally.demo"');
  });
});

describe("colours", () => {
  it("equal the page background tokens, light and dark, on both platforms", () => {
    const tokens = read("../web/src/design/tokens.css");
    expect(tokens).toMatch(new RegExp(`--c-bg:\\s*light-dark\\(\\s*${BG_LIGHT}\\s*,\\s*${BG_DARK}\\s*\\)`, "i"));
    expect(read("android/app/src/main/res/values/colors.xml")).toContain(`>${BG_LIGHT}<`);
    expect(read("android/app/src/main/res/values-night/colors.xml")).toContain(`>${BG_DARK}<`);
    const iosHex = (rgb: string): string[] => [rgb.slice(1, 3), rgb.slice(3, 5), rgb.slice(5, 7)].map((h) => `0x${h}`);
    const colorset = read("ios/App/App/Assets.xcassets/WallyBackground.colorset/Contents.json");
    for (const hex of [...iosHex(BG_LIGHT), ...iosHex(BG_DARK)]) expect(colorset.toLowerCase()).toContain(hex.toLowerCase());
  });
});

describe("committed native sources", () => {
  it("hold no signing identity, team id, keystore or secret", () => {
    expect(native.filter((f) => /\.(jks|keystore|p12|p8|mobileprovision|cer|pem)$/i.test(f))).toEqual([]);
    const flagged = native
      .filter((f) => TEXT.test(f))
      .filter((f) => /DEVELOPMENT_TEAM\s*=\s*[A-Z0-9]{10}|storePassword|keyPassword|signingConfigs\s*\{|-----BEGIN|PROVISIONING_PROFILE_SPECIFIER\s*=\s*"?\w/.test(read(f)));
    expect(flagged.map((f) => relative(MOBILE, join(MOBILE, f)))).toEqual([]);
  });

  it("do not use the retired product names", () => {
    const banned = [["lai", "see"].join(" "), ["red", "packet"].join(" "), "利是"];
    const flagged = [...native, ...sources("scripts"), ...sources("native"), "capacitor.config.ts", "README.md"]
      .filter((f) => TEXT.test(f))
      .filter((f) => banned.some((word) => read(f).toLowerCase().includes(word)));
    expect(flagged).toEqual([]);
  });
});
