# CHECK — Native mobile apps

Native clients for the inspection platform. **Online-first** (call the API live);
offline sync is a planned later phase.

Both talk to the same API as the web app. Point them at your API:
- **iOS Simulator** → `http://localhost:4000` (default in `Sources/API.swift`).
- **Android Emulator** → `http://10.0.2.2:4000` (default in `app/build.gradle.kts`).
- **Real device** → the LAN HTTPS URL, e.g. `https://192.168.20.109/api`
  (install the mkcert root CA on the device first — see the root README).

Start the backend before running: `docker compose --profile app up -d` (or `npm run dev`).
Seed login: `admin@check.test` / `password123` (inspector: `civil@check.test`).

---

## iOS (Swift / SwiftUI) — `ios/`

Requires Xcode. The project is generated with **XcodeGen**.

```bash
cd mobile/ios
brew install xcodegen        # once
xcodegen generate            # creates CheckInspections.xcodeproj
open CheckInspections.xcodeproj   # ⌘R to run, or:
xcodebuild -scheme CheckInspections -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

✅ Verified: builds and runs in the simulator — login → inspections/My-Day list →
inspection detail (room picker, status, signatures, photo thumbnails).

## Android (Kotlin / Jetpack Compose) — `android/`

Open `mobile/android` in **Android Studio** (it syncs Gradle and creates the
wrapper) and Run. Requires JDK 17+ and the Android SDK (managed by Android Studio).

✅ Verified: builds a debug APK (`assembleDebug`) and runs in an emulator — login →
inspection list → New Inspection (customer/property + OSM map picker) → Team/Users.
Map uses **osmdroid** (OpenStreetMap, no API key). Architecture mirrors iOS:
Retrofit + kotlinx serialization, DataStore token storage, Compose screens.

> CLI build (no Android Studio): point `JAVA_HOME` at a JDK 17+ (Android Studio's
> bundled JBR works), create `local.properties` with `sdk.dir=…`, then
> `gradle :app:assembleDebug`.

---

## Status

Both platforms have the **field-inspector core**:
- Login (JWT + refresh)
- My Day (agenda by date) for inspectors / Inspections list for staff
- Inspection detail: room picker, per-check status, discipline-filtered for inspectors,
  signatures (inspector + manager approval, incl. admin override), photo view/upload
- Signature capture (PencilKit on iOS, Compose canvas on Android)

**Both platforms now have the staff workflow** (iOS `StaffScreens.swift`,
Android `StaffScreens.kt`), reachable from the toolbar when logged in as ADMIN/MANAGER:
- **New Inspection** (+): page 1 enters customer + property (with a map picker) → creates
  a draft; page 2 sets the scheduled date and assigns an inspector per discipline.
- **Team** (people icon): lists users; ADMIN can add a user (name/email/password/role,
  plus discipline for inspectors).

**Both** also have **camera capture**, a **map address picker** (Baghdad default — MapKit
on iOS, osmdroid/OpenStreetMap on Android), **photo annotation** — every captured or
chosen photo opens a draw-on-it editor (red ink) to mark the issue before upload
(iOS `Pickers.swift`, Android `Photos.kt`) — and **photo removal**: each thumbnail on an
editable check has an ✕ to delete a bad photo (offline-aware, optimistic).

**Both platforms have offline support** (iOS `Offline.swift`, Android `Offline.kt`):
reads fall back to an on-disk cache when unreachable, field writes (status/note/photo/
signature) queue to a persisted outbox and replay automatically on reconnect, with an
offline / pending-sync banner. *(iOS uses URLSession + a JSON cache/outbox; Android uses
the OkHttp disk cache + an interceptor-based write queue.)*

**iOS and Android are now at parity.** Both build and run; offline edits made on either
platform sync to the same backend on reconnect.
