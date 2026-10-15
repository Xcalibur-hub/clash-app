# Android local development recovery

## Diagnosis — 2026-10-08

Git started on `main` at `093e5ffd8d2e4382b069c027802d5beadce5ccee`, matching
`origin/main`. Existing uncommitted Crew work and unrelated artifacts were preserved.

The Samsung Galaxy A50 (`SM-A505F`) had a **debug** `com.clash.v2` APK last updated
October 3. It uses React Native's Metro development bundle, rather than an Expo
development-client launcher (`expo-dev-client` is not installed in this project).
Its `BridgelessReactNativeDevBundle.js` cache was dated October 8, 15:40, and
Metro's manifest identified this repository and a SDK 54 `dev=true` bundle.
Reopening the app reproduced `Cannot find native module 'ExpoCamera'` while
Expo Router imported the existing Meet video preparation route. The consequent
missing-default-export warning was caused by that import failure. Dismissing
the error during earlier testing did not make the installed APK compatible.

Device logs also recorded `Cannot connect to Metro` at 15:21. The old local
startup helper forwarded only Supabase port 55321, used a foreground Metro
process, and forced the development variant although only the older
`com.clash.v2` debug package was installed. USB reverse rules and host processes
are development-session state; Git commits do not install an APK or keep Metro
running. During diagnosis both reverse rules were present, Supabase returned
HTTP 200 from Android, and Metro served the current repository.

## Repeatable startup

From the repository root, with the USB device connected and the existing local
Supabase stack running:

```powershell
npm.cmd run dev:local -- --background
```

The command verifies backend health, regenerates only the ignored local Expo
environment, forwards **8081 and 55321**, selects the installed CLASH debug
package, and verifies that an existing Metro on 8081 serves this repository.
If Metro is absent it launches a detached, hidden process and opens the app.
Its log is `.expo/metro-local.log`. Re-run after a USB reconnect. A foreground
server already running on 8081 is reused; its original process lifecycle is
unchanged. To make that server independent of its terminal, stop it explicitly
and run the background command.

The `production` config variant used for the older `com.clash.v2` package does
not make this a release build: the command checks Android's `DEBUGGABLE` flag.
It does not change the native package identity, install another app, or clear
the current app's session/data. The local environment remains separate from
hosted credentials.

Latest development JavaScript requires Metro and local Supabase to stay running
and the phone to retain its USB forwarding. This workflow does not create an
offline release or publish an EAS Update. Existing onboarding can appear again
after a full store reload; use its existing Skip action to reach Arena.

## Bounded native rebuild

A new APK is necessary when the JavaScript imports native modules absent from
the installed binary. Build the existing generated Android project without
resetting it or changing its package identity:

```powershell
Set-Location android
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2' `
  '-Dorg.gradle.parallel=false' `
  '-Pkotlin.compiler.execution.strategy=in-process' `
  '-PreactNativeArchitectures=arm64-v8a'
```

Only install after `BUILD SUCCESSFUL`:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Run that install command from the repository root. `-r` replaces the matching
signed APK while preserving its data; do not uninstall or run `pm clear`.

The initial bounded 768 MB heap build passed Kotlin compilation but failed
DEX merging with `Java heap space`. A 1.5 GB retry encountered a full system
disk. Recovery removed the incomplete diagnostic APK copy and verified
generated native intermediates/CMake caches for unused `armeabi-v7a` builds
inside `node_modules`; it did not remove source, Crew work, Android app data,
or database data. Windows paging configuration was not changed. Metro was
temporarily stopped to reduce commit-memory pressure during the rebuild.
Detailed build logs are ignored under `.expo/android-startup-check/`.

Android's generated native build invoked Ninja directly, ignoring
`CMAKE_BUILD_PARALLEL_LEVEL`. The remaining C++ targets therefore needed an
explicit serial invocation before returning to Gradle assembly:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin\ninja.exe" `
  -C android/app/.cxx/Debug/6f5p73zn/arm64-v8a -j1 `
  appmodules react_codegen_rnscreens react_codegen_rnsvg react_codegen_safeareacontext
```

The generated CMake hash/path is specific to this checkout; inspect Gradle's
native command before reusing it. This is a build-resource constraint, not a
change to UI, backend authorization, or native feature behavior.

After the serial target completed, temporary app `.o` files were removed to
recover 126 MB for APK packaging; linked `.so` outputs were retained. The
assembly invocation used `-x ':app:buildCMakeDebug[arm64-v8a]'` only because that
exact target had already completed successfully through Ninja. Do not use that
exclusion before compiling the native target. Compiler crash diagnostics
explicitly named in the failed build log were also removed from the temporary
directory. System disk space remains constrained; these are disposable build
artifacts, not user/application data.
