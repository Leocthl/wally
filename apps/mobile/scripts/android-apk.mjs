#!/usr/bin/env node
// Builds the debug APK with Gradle. Picks a JDK Gradle can run on (21 preferred, 17 works through the shim in
// android/build.gradle), points Gradle at the Android SDK, keeps memory low (one worker, no daemon, 1 GiB heap) and
// never downloads SDK components. Run `pnpm --filter @wally/mobile sync` first.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const android = join(mobile, "android");
const apk = join(android, "app/build/outputs/apk/debug/app-debug.apk");
const JDK_RANGE = { min: 17, max: 24 };

function javaMajor(home) {
  const java = join(home, "bin/java");
  if (!existsSync(java)) return null;
  const out = spawnSync(java, ["-version"], { encoding: "utf8" });
  const match = /version "(\d+)/.exec(`${out.stderr}${out.stdout}`);
  return match ? Number.parseInt(match[1], 10) : null;
}

function macJavaHome(version) {
  const res = spawnSync("/usr/libexec/java_home", ["-v", String(version)], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** Candidate JDK homes, most preferred first: JAVA_HOME, the macOS registry, Homebrew, Android Studio's runtime. */
function candidates() {
  const brew = (v) => `/opt/homebrew/opt/openjdk@${v}/libexec/openjdk.jdk/Contents/Home`;
  return [
    process.env.JAVA_HOME,
    macJavaHome(21),
    brew(21),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    macJavaHome(17),
    brew(17),
  ].filter((home) => typeof home === "string" && home.length > 0);
}

function pickJdk() {
  for (const home of candidates()) {
    const major = javaMajor(home);
    if (major !== null && major >= JDK_RANGE.min && major <= JDK_RANGE.max) return { home, major };
  }
  throw new Error(
    `No JDK ${JDK_RANGE.min} to ${JDK_RANGE.max} found (Gradle 8.14 cannot run on newer ones). Install one, for example:\n` +
      "  brew install --cask temurin@21\nthen run this again (or set JAVA_HOME to it).",
  );
}

function sdkDir() {
  const dir = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), "Library/Android/sdk");
  if (!existsSync(join(dir, "platforms"))) throw new Error(`Android SDK not found at ${dir}. Install Android Studio or set ANDROID_HOME.`);
  return dir;
}

function ensureLocalProperties(sdk) {
  const file = join(android, "local.properties");
  if (existsSync(file) && readFileSync(file, "utf8").includes("sdk.dir=")) return;
  writeFileSync(file, `sdk.dir=${sdk}\n`);
}

if (!existsSync(join(android, "app/src/main/assets/public/index.html"))) throw new Error("web files missing in the Android project: run `pnpm --filter @wally/mobile sync` first");

const jdk = pickJdk();
const sdk = sdkDir();
ensureLocalProperties(sdk);
console.log(`mobile: Gradle on JDK ${jdk.major} (${jdk.home}), SDK ${sdk}`);

const gradle = spawnSync(
  "./gradlew",
  ["assembleDebug", "--no-daemon", "--console=plain", "-Dorg.gradle.jvmargs=-Xmx1g", "-Dorg.gradle.workers.max=2", "-Pandroid.builder.sdkDownload=false"],
  { cwd: android, stdio: "inherit", env: { ...process.env, JAVA_HOME: jdk.home, ANDROID_HOME: sdk } },
);
spawnSync("./gradlew", ["--stop"], { cwd: android, stdio: "ignore", env: { ...process.env, JAVA_HOME: jdk.home } });
if (gradle.status !== 0) throw new Error(`gradle assembleDebug failed (exit ${gradle.status ?? gradle.signal})`);
console.log(`mobile: APK ${apk} (${(statSync(apk).size / (1024 * 1024)).toFixed(1)} MiB)`);
