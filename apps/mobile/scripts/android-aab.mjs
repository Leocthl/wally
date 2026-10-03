#!/usr/bin/env node
// Builds the signed release bundle (.aab) for a Google Play upload. Same JDK and SDK discovery as android-apk.mjs.
// The upload key stays outside the repository: WALLY_KEYSTORE_PROPERTIES names a properties file (default
// ~/.android-keys/wally-upload.properties) with storeFile, storePassword, keyAlias, keyPassword; scripts/android-signing.init.gradle reads it.
//   pnpm --filter @wally/mobile sync
//   pnpm --filter @wally/mobile android:aab -- --code 2 --name 1.0.1
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ensureLocalProperties, pickJdk, sdkDir } from "./android-env.mjs";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const android = join(mobile, "android");
const aab = join(android, "app/build/outputs/bundle/release/app-release.aab");
const { values } = parseArgs({ options: { code: { type: "string", default: "1" }, name: { type: "string", default: "1.0" } }, args: process.argv.slice(2).filter((a) => a !== "--") });
if (!/^[1-9]\d{0,8}$/.test(values.code)) throw new Error("--code must be a positive integer (the versionCode: higher on every upload)");

const keystoreProps = process.env.WALLY_KEYSTORE_PROPERTIES ?? join(homedir(), ".android-keys/wally-upload.properties");
if (!existsSync(keystoreProps)) throw new Error(`No keystore properties at ${keystoreProps}. Create the upload key first (apps/mobile/README.md, "Store builds").`);
if (!existsSync(join(android, "app/src/main/assets/public/index.html"))) throw new Error("web files missing in the Android project: run `pnpm --filter @wally/mobile sync` first");

const jdk = pickJdk();
const sdk = sdkDir();
ensureLocalProperties(android, sdk);
console.log(`mobile: Gradle on JDK ${jdk.major} (${jdk.home}), SDK ${sdk}, versionCode ${values.code}, versionName ${values.name}`);

const gradle = spawnSync(
  "./gradlew",
  ["bundleRelease", "-I", join(mobile, "scripts/android-signing.init.gradle"), `-PwallyVersionCode=${values.code}`, `-PwallyVersionName=${values.name}`,
    "--no-daemon", "--console=plain", "-Dorg.gradle.jvmargs=-Xmx1g", "-Dorg.gradle.workers.max=2", "-Pandroid.builder.sdkDownload=false"],
  { cwd: android, stdio: "inherit", env: { ...process.env, JAVA_HOME: jdk.home, ANDROID_HOME: sdk, WALLY_KEYSTORE_PROPERTIES: keystoreProps } },
);
spawnSync("./gradlew", ["--stop"], { cwd: android, stdio: "ignore", env: { ...process.env, JAVA_HOME: jdk.home } });
if (gradle.status !== 0) throw new Error(`gradle bundleRelease failed (exit ${gradle.status ?? gradle.signal})`);

const verify = spawnSync(join(jdk.home, "bin/jarsigner"), ["-verify", aab], { encoding: "utf8" });
if (verify.status !== 0 || !/jar verified/.test(verify.stdout)) throw new Error(`the bundle is not signed: ${verify.stdout}${verify.stderr}`);
console.log(`mobile: signed bundle ${aab} (${(statSync(aab).size / (1024 * 1024)).toFixed(1)} MiB)`);
