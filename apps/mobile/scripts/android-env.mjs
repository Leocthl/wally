// Shared by android-apk.mjs and android-aab.mjs: pick a JDK Gradle can run on and find the Android SDK.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

export function pickJdk() {
  for (const home of candidates()) {
    const major = javaMajor(home);
    if (major !== null && major >= JDK_RANGE.min && major <= JDK_RANGE.max) return { home, major };
  }
  throw new Error(
    `No JDK ${JDK_RANGE.min} to ${JDK_RANGE.max} found (Gradle 8.14 cannot run on newer ones). Install one, for example:\n` +
      "  brew install --cask temurin@21\nthen run this again (or set JAVA_HOME to it).",
  );
}

export function sdkDir() {
  const dir = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), "Library/Android/sdk");
  if (!existsSync(join(dir, "platforms"))) throw new Error(`Android SDK not found at ${dir}. Install Android Studio or set ANDROID_HOME.`);
  return dir;
}

export function ensureLocalProperties(android, sdk) {
  const file = join(android, "local.properties");
  if (existsSync(file) && readFileSync(file, "utf8").includes("sdk.dir=")) return;
  writeFileSync(file, `sdk.dir=${sdk}\n`);
}
