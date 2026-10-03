#!/usr/bin/env node
// Builds the debug APK with Gradle. Picks a JDK Gradle can run on (21 preferred, 17 works through the shim in
// android/build.gradle), points Gradle at the Android SDK, keeps memory low (one worker, no daemon, 1 GiB heap) and
// never downloads SDK components. Run `pnpm --filter @wally/mobile sync` first. For a Play upload see android-aab.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLocalProperties, pickJdk, sdkDir } from "./android-env.mjs";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const android = join(mobile, "android");
const apk = join(android, "app/build/outputs/apk/debug/app-debug.apk");

if (!existsSync(join(android, "app/src/main/assets/public/index.html"))) throw new Error("web files missing in the Android project: run `pnpm --filter @wally/mobile sync` first");

const jdk = pickJdk();
const sdk = sdkDir();
ensureLocalProperties(android, sdk);
console.log(`mobile: Gradle on JDK ${jdk.major} (${jdk.home}), SDK ${sdk}`);

const gradle = spawnSync(
  "./gradlew",
  ["assembleDebug", "--no-daemon", "--console=plain", "-Dorg.gradle.jvmargs=-Xmx1g", "-Dorg.gradle.workers.max=2", "-Pandroid.builder.sdkDownload=false"],
  { cwd: android, stdio: "inherit", env: { ...process.env, JAVA_HOME: jdk.home, ANDROID_HOME: sdk } },
);
spawnSync("./gradlew", ["--stop"], { cwd: android, stdio: "ignore", env: { ...process.env, JAVA_HOME: jdk.home } });
if (gradle.status !== 0) throw new Error(`gradle assembleDebug failed (exit ${gradle.status ?? gradle.signal})`);
console.log(`mobile: APK ${apk} (${(statSync(apk).size / (1024 * 1024)).toFixed(1)} MiB)`);
