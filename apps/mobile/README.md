# apps/mobile

- **What**: iOS and Android shells (Capacitor 8) around the `apps/web` build. App id `app.wally.demo`, name Wally.
- **Mode**: on-device by default. The real engine runs in the page with recorded model answers, no server, no network call. The rail is SIMULATED.
- **Live mode over the LAN (opt-in)**: About, "Connect to the booth Mac": paste the link the booth Mac shows (QR panel in About or Presenter, server started with `pnpm demo:lan`). The page then calls `http://<mac-ip>:8787` with the pairing token; see `apps/web/README.md`, "Phones on the booth Wi-Fi". "Disconnect" returns to on-device mode.
- **Web changes**: `apps/web/src/pwa/native.ts`, `register.ts` and `ui/haptics.ts` check `window.Capacitor` and do nothing in a browser. The About sheet has one native-only row, "Connect to the booth Mac" (`src/shell/BoothConnect.tsx`).

## Commands
- **From**: the repo root after `pnpm install`. Shortcut: `cd apps/mobile`, then `pnpm <script>`.

| Command | Does |
|---|---|
| `pnpm --filter @wally/mobile sync` | builds `apps/web` with `VITE_API=local` into `apps/mobile/www` (not `apps/web/dist`), adds the bridge script, copies it into both projects |
| `pnpm --filter @wally/mobile ios:sim` | unsigned Simulator build into `~/Library/Caches/wally-ios` (`WALLY_IOS_BUILD` to change), boots iPhone 17 (`IOS_SIM_NAME` to change), installs, launches |
| `pnpm --filter @wally/mobile android:apk` | `assembleDebug`; APK at `android/app/build/outputs/apk/debug/app-debug.apk` |
| `pnpm --filter @wally/mobile ios:open` / `android:open` | opens Xcode / Android Studio |
| `pnpm --filter @wally/mobile assets` | icon and splash sets from `apps/web/public/icons/icon.svg` (`assets/` masters, then `@capacitor/assets`) |

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
  -destination 'generic/platform=iOS' -derivedDataPath ~/Library/Caches/wally-ios -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=<team id> PRODUCT_BUNDLE_IDENTIFIER=app.wally.demo.<yourname> build
xcrun devicectl list devices
xcrun devicectl device install app --device <device id> ~/Library/Caches/wally-ios/Build/Products/Debug-iphoneos/App.app
```

- **Via Xcode instead**: set the Team under Signing and Capabilities, then run `git restore apps/mobile/ios/App/App.xcodeproj/project.pbxproj` before committing.
- **Release signing**: keep keystores and profiles outside the repo; `*.keystore`, `*.jks`, `*.p12`, `*.mobileprovision` are gitignored and `test/hygiene.test.ts` fails on team ids or passwords in the native sources.

## Store builds (TestFlight and Google Play internal testing)
- **Nothing secret is committed**: the upload key, its passwords and the team id stay on the building Mac, outside the repo.
- **Android**: make an upload key once, for example `keytool -genkeypair -keystore ~/.android-keys/wally-upload.jks -storetype PKCS12 -alias wally-upload -keyalg RSA -keysize 4096 -validity 10000`, and a properties file next to it (mode 600) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`; `WALLY_KEYSTORE_PROPERTIES` names it (default `~/.android-keys/wally-upload.properties`). Then `pnpm --filter @wally/mobile sync` and `pnpm --filter @wally/mobile android:aab -- --code <n> --name 1.0`: the versionCode must rise on every upload, and `scripts/android-signing.init.gradle` signs the bundle. Upload `android/app/build/outputs/bundle/release/app-release.aab` in Play Console, Internal testing, Create new release (Play App Signing stays on); testers are an email list of Google accounts.
- **iOS**: the Apple ID is in Xcode (Settings, Accounts). Archive without signing, then export with automatic signing, which makes the distribution certificate and the App Store profile and uploads the build:

```
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath <dir>/Wally.xcarchive CODE_SIGNING_ALLOWED=NO MARKETING_VERSION=1.0 CURRENT_PROJECT_VERSION=<build> archive
xcodebuild -exportArchive -archivePath <dir>/Wally.xcarchive -exportPath <dir>/export \
  -exportOptionsPlist <ExportOptions.plist> -allowProvisioningUpdates
```

- **ExportOptions.plist** (kept outside the repo because it names the team): `method` app-store-connect, `destination` upload (or export to get the .ipa), `teamID`, `signingStyle` automatic. The build number must rise on every upload. `Info.plist` sets `ITSAppUsesNonExemptEncryption` to false (HTTPS and signatures only) and `App/PrivacyInfo.xcprivacy` declares no tracking and no collected data.
- **App Store Connect**: the app record needs the bundle id `app.wally.demo` (the store name may differ: "Wally" was taken). TestFlight internal testers must be App Store Connect users with a role that can test (for example Customer Support, limited to this app); no review is needed for internal testing.

## Behaviour in the shell
- **Safe areas**: the shell insets the page below the status bar and above the home indicator (iOS `contentInset: always`, Android system-bar insets), and `build-web.mjs` drops `viewport-fit=cover` from the shell copy of `index.html`. For an edge-to-edge page that pads itself with `env(safe-area-inset-*)`, run `WALLY_EDGE_TO_EDGE=1 pnpm sync`.
- **Backgrounds**: `#F4F7FE` light, `#0B1220` dark, native on both platforms (iOS colour set and launch screen, Android `values` and `values-night`); `test/hygiene.test.ts` keeps them equal to the design tokens.
- **Splash**: the system launch screen, then the plugin splash, hidden after the page paints twice (3 s at most).
- **Service worker and install prompt**: off. The install row reads "installed".
- **Android back**: previous hash route; at the home route (`""`, `budget`, `booth`; list in `native.ts`) it exits the app.
- **Haptics**: the Capacitor Haptics plugin; `navigator.vibrate` in a browser. Off under reduced motion.
- **Offline checker**: the page is not bundled in the shells (the booth and the static site serve it), so Proof leaves its links out there; the receipts are still checked on the phone. A link would open a blank page with no way back.

## Known limits
- **Recorded answers unless connected**: on-device mode has no Laya and no live judge; connecting to the booth Mac (same Wi-Fi) gives both.
- **LAN door**: Android allows cleartext and mixed content; iOS allows local networking and asks once for local network access. Nothing else loads over http. The LAN link itself has not been run in either shell.
- **Debug builds**: no store signing, no push. The camera and photo library are asked for only when a shopper taps Show Wally a photo (the two usage strings in `ios/App/App/Info.plist`).
- **Checked**: iPhone 17 Simulator (iOS 27.0, light and dark), Android emulator API 36 (light, dark, back button). Not run on a physical device.
- **Tablets**: iPad runs the same layout; Android and iPhone are locked to portrait.
