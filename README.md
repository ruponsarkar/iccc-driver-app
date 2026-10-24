# GMC ICCC Driver

Expo React Native app for assigning a driver to a bus. Based on the supplied reference, with login moved first. Android and iOS are the primary targets.

## Run

Use Node **22.13 or newer on the Node 22 line** (`nvm use`). SDK 58 also supports Node 24.3+ on the 24 line and Node 26+; Node 20 and odd-numbered releases are unsupported.

```sh
npm install
cp .env.example .env
npm start
```

Open with a compatible Expo Go (SDK 58), or use `npm run android` / `npm run ios` with an emulator/simulator installed. Camera scanning and location should be tested on a physical phone. `npm run typecheck` and `npm test` run the local checks.

SDK 58 requires an SDK 58-compatible Expo Go. If it is not yet available in your app store, use a native build (`npx expo run:android` / `npx expo run:ios`, with the platform toolchain installed) or the EAS preview APK below. Rebuild any existing native app after upgrading; an SDK 55 binary cannot load SDK 58. See the [SDK 58 upgrade notes](https://expo.dev/changelog/sdk-58).

Demo login: **DRV-014** (or **9876543210**), PIN **1234**. Select the demo bus or enter **AS 01 UC 8803**. A QR can contain `BUS-014`, the registration, or JSON such as `{"vehicleId":"BUS-014"}`. Unknown demo vehicles are rejected.

Login is stored with Expo SecureStore on mobile. The PIN is never persisted. On reopening, the app restores the session and checks active duty. Expired server sessions return to login. Demo duty persists locally; live duty is fetched from the backend. Sign out is available when there is no active duty. The demo does not send assignments to any server. If GPS is unavailable, demo mode explicitly shows that location is unavailable; live mode requires location to start duty.

## Backend configuration

```dotenv
EXPO_PUBLIC_USE_MOCK_API=false
EXPO_PUBLIC_API_URL=https://your-server.example.com/api
```

Restart Expo after changing environment values; rebuild distributed apps for changed values. `EXPO_PUBLIC_*` values are bundled and must contain no secrets. The `.env` file is ignored; `.env.example` is committed. For Android emulator access to a local backend, use the host address `10.0.2.2`; physical devices need a reachable LAN/HTTPS endpoint.

The backend adapter is `src/api.ts`; data types are in `src/models.ts`. This contract is implemented in the sibling `iccc-backend` project; see `../iccc-backend/docs/driver-app-api.md` for table setup, PIN provisioning, and deployment details. JSON responses are unwrapped (no `data` envelope). Authenticated routes use `Authorization: Bearer <token>`.

| Method | Route | Request | Response |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ identifier, pin }` | `{ token, driver: { id, name } }` |
| GET | `/vehicles/:identifier` | — | `{ id, number, type, gpsOnline, currentDriver: { id, name } \| null, assignmentVersion, qrValue }` |
| GET | `/duties/current` | — | `Duty` or JSON `null` |
| POST | `/duties` | `{ vehicleId, assignmentVersion, replaceExistingDriver, location }` | `Duty` |
| POST | `/duties/:id/end` | `{ location }` | HTTP 204 |

`Duty`: `{ id, driver, vehicle, startedAt, location, status: "ACTIVE" }`. Timestamps are ISO 8601. Location is `{ latitude, longitude, accuracy }` (accuracy in meters) or `null` when unavailable at end duty. Errors should return a non-2xx response with `{ message }`; 401 clears the saved session.

The backend derives the driver from the token, validates authorization and GPS coordinates, timestamps actions, and atomically closes previous mobile assignments on explicit replacement. It enforces one active mobile duty per driver/vehicle and supports retries. `assignmentVersion` from vehicle lookup protects against stale confirmations; a changed assignment returns 409. The client checks current duty before retrying start/end, but the server remains authoritative. Add refresh-token handling to the adapter if your backend supports it. OTP is not implemented because no OTP backend was supplied; this build uses PIN login.

## Android APK

```sh
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

The preview profile in `eas.json` produces an installable APK and requires an Expo account. Configure the same environment variables in your EAS build environment (local ignored `.env` files should not be relied on for cloud builds). Production builds must set mock mode false and a real API URL. iOS distribution requires Apple signing credentials.

## Device acceptance checks

1. Log in with the demo credentials, restart, and confirm login is skipped.
2. Deny camera permission and find the bus manually; enable camera and scan a supported QR.
3. Confirm the existing-driver warning, start duty, and check driver, bus, time, and location.
4. Restart during duty and confirm it restores; end duty and confirm vehicle selection returns.
5. In live integration, test 401, offline/timeout responses, assignment conflicts, location denial, and retries without duplicate duties.

Reference APIs: [Expo Camera](https://docs.expo.dev/versions/v58.0.0/sdk/camera/) and [Expo SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).

## Validation notes

TypeScript and QR parsing tests are provided. Android/iOS JavaScript exports validate bundling but are not a substitute for physical-device QA or a signed APK build. The installation audit currently reports five high-severity findings in Expo CLI transitive dependencies (`node-forge` and `zod`, plus parent packages). No forced major downgrade or incompatible override has been applied; review these toolchain dependencies before production release.

Additional live routes: `POST /auth/logout`, `GET /auth/me`, `GET /vehicles?q=...&limit=20&offset=0`, and `GET /duties/history?limit=20&offset=0`. Search/history return `{ items, total, limit, offset }`. Adapter methods are available; dedicated search/history list screens are not yet included. For local Android emulator testing, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8100/api` and mock mode to false after completing backend setup. Use the host LAN address on physical devices and HTTPS in release builds.
