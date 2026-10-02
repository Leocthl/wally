# apps/mobile

- **What**: iOS and Android shells (Capacitor 8) around the `apps/web` build. App id `app.wally.demo`, name Wally.
- **Mode**: on-device only. The real engine runs in the page with recorded model answers, no server, no network call. The rail is SIMULATED.
- **Not built**: live Mac-backed mode over the LAN.
- **Web changes**: none to screens. `apps/web/src/pwa/native.ts`, `register.ts` and `ui/haptics.ts` check `window.Capacitor` and do nothing in a browser.

## Commands
Run from the repo root (`pnpm install` first). Shortcut: `cd apps/mobile`, then `pnpm <script>`.

| Command | Does |
|---|---|
| `pnpm --filter @laisee/mobile sync` | builds `apps/web` with `VITE_API=local` into `apps/mobile/www` (not `apps/web/dist`), adds the bridge script, copies it into both projects |
| `pnpm --filter @laisee/mobile ios:sim` | unsigned Simulator build, boots iPhone 17 (`IOS_SIM_NAME` to change), installs, launches |
| `pnpm --filter @laisee/mobile android:apk` | `assembleDebug`; APK at `android/app/build/outputs/apk/debug/app-debug.apk` |
| `pnpm --filter @laisee/mobile ios:open` / `android:open` | opens Xcode / Android Studio |
| `pnpm --filter @laisee/mobile assets` | icon and splash sets from `apps/web/public/icons/icon.svg` (`assets/` masters, then `@capacitor/assets`) |

- **After a web change**: run `sync` again, then the platform command. `www/` and the web copies inside `ios/` and `android/` are gitignored.
- **Stop**: `xcrun simctl shutdown all`; Gradle runs with no daemon.

## Needs
| Part | Needs |
|---|---|
| iOS | Xcode with an iOS Simulator runtime (built with Xcode 27.0, iOS 27.0); SwiftPM fetches `capacitor-swift-pm` from GitHub on first build |
| Android | JDK 21 (`brew install --cask temurin@21`), or JDK 17 through the shim in `android/build.gradle`; Android SDK platform 36 and build-tools 36; `JAVA_HOME` and `ANDROID_HOME` are found for you |

- **JDK**: `android:apk` picks 21, else 17, up to 24. Gradle 8.14 cannot run on JDK 25 or newer, so a machine with only that needs 21 or 17.
- **SDK**: nothing is downloaded by the build; `android/local.properties` (gitignored) is written from `ANDROID_HOME` or `~/Library/Android/sdk`.

## Run
- **iOS Simulator**: `ios:sim`. Dark mode: `xcrun simctl ui booted appearance dark`.
- **Android emulator**: start an AVD, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` and `adb shell am start -n app.wally.demo/.MainActivity`.
- **Android phone**: USB debugging on, same `adb install -r`; or send the APK file and allow installs from that app. The debug APK is signed with the SDK debug key.
- **iPhone**: needs an Apple ID in Xcode (Settings, Accounts), Developer Mode on the phone, a unique bundle id per person. The team id goes on the command line, so nothing is written into the repo:

```
cd apps/mobile
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath ios/App/build -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=<team id> PRODUCT_BUNDLE_IDENTIFIER=app.wally.demo.<yourname> build
xcrun devicectl list devices
xcrun devicectl device install app --device <device id> ios/App/build/Build/Products/Debug-iphoneos/App.app
```

- **Via Xcode instead**: set the Team under Signing and Capabilities, then run `git restore apps/mobile/ios/App/App.xcodeproj/project.pbxproj` before committing.
- **Release signing**: keep keystores and profiles outside the repo; `*.keystore`, `*.jks`, `*.p12`, `*.mobileprovision` are gitignored and `test/hygiene.test.ts` fails on team ids or passwords in the native sources.

## Behaviour in the shell
- **Safe areas**: the shell insets the page below the status bar and above the home indicator (iOS `contentInset: always`, Android system-bar insets), and `build-web.mjs` drops `viewport-fit=cover` from the shell copy of `index.html`. For an edge-to-edge page that pads itself with `env(safe-area-inset-*)`, run `WALLY_EDGE_TO_EDGE=1 pnpm sync`.
- **Backgrounds**: `#F4F7FE` light, `#0B1220` dark, native on both platforms (iOS colour set and launch screen, Android `values` and `values-night`); `test/hygiene.test.ts` keeps them equal to the design tokens.
- **Splash**: the system launch screen, then the plugin splash, hidden after the page paints twice (3 s at most).
- **Service worker and install prompt**: off. The install row reads "installed".
- **Android back**: previous hash route; at the home route (`""`, `budget`, `booth`; list in `native.ts`) it exits the app.
- **Haptics**: the Capacitor Haptics plugin; `navigator.vibrate` in a browser. Off under reduced motion.

## Known limits
- **Recorded answers only**: no Laya, no live judge, no LAN mode.
- **Debug builds**: no store signing, no push, no camera.
- **Checked**: iPhone 17 Simulator (iOS 27.0, light and dark), Android emulator API 36 (light, dark, back button). Not run on a physical device.
- **Tablets**: iPad runs the same layout; Android and iPhone are locked to portrait.
