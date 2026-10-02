#!/usr/bin/env node
// Builds the iOS app for the Simulator (no signing), boots the device, installs and launches the app.
// Run `pnpm --filter @laisee/mobile sync` first. Env: IOS_SIM_NAME (default "iPhone 17"). Flags: --no-boot-ui keeps
// the Simulator window closed (the device still boots).
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const project = join(mobile, "ios/App/App.xcodeproj");
const derived = join(mobile, "ios/App/build");
const APP_ID = "app.wally.demo";
const device = process.env.IOS_SIM_NAME ?? "iPhone 17";
const app = join(derived, "Build/Products/Debug-iphonesimulator/App.app");

function run(cmd, args, { allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { cwd: mobile, stdio: "inherit" });
  if (res.status !== 0 && !allowFail) throw new Error(`${cmd} ${args[0] ?? ""} failed (exit ${res.status ?? res.signal})`);
  return res.status === 0;
}

if (!existsSync(join(mobile, "ios/App/App/public/index.html"))) throw new Error("web files missing in the iOS project: run `pnpm --filter @laisee/mobile sync` first");

run("xcodebuild", [
  "-project", project,
  "-scheme", "App",
  "-configuration", "Debug",
  "-sdk", "iphonesimulator",
  "-destination", `platform=iOS Simulator,name=${device}`,
  "-derivedDataPath", derived,
  "-quiet",
  "CODE_SIGNING_ALLOWED=NO",
  "build",
]);

// "boot" fails when the device is already booted; bootstatus then waits until it is usable.
run("xcrun", ["simctl", "boot", device], { allowFail: true });
run("xcrun", ["simctl", "bootstatus", device, "-b"]);
if (!process.argv.includes("--no-boot-ui")) run("open", ["-a", "Simulator"], { allowFail: true });
run("xcrun", ["simctl", "install", device, app]);
run("xcrun", ["simctl", "launch", device, APP_ID]);
console.log(`mobile: ${APP_ID} running on ${device}; app ${Math.round(dirSize(app) / 1024)} KiB. Stop with: xcrun simctl shutdown all`);

function dirSize(path) {
  const du = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  return Number.parseInt(du.stdout, 10) * 1024 || statSync(path).size;
}
