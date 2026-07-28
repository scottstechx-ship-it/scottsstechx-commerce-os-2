# ScottsTechX Commerce OS

Trust-gated marketplace backend (Fastify + Postgres) plus an Android
Kotlin/Compose client. Built for Uganda-style mass-market use with
AI seller/customer assistance, location-ranked nearby sellers, and
Google One-Tap sign-in.

## Repository layout

| Path | What |
|---|---|
| `12_Backend/` | Fastify + Postgres + embedded-postgres backend. Run locally with `npm install && npm run dev`. |
| `android-app/` | Kotlin + Jetpack Compose + Hilt client. Open in Android Studio (Hedgehog 2024.1.1+), `./gradlew :app:assembleDebug`. |
| `README.md` | This file. |

Each subdirectory has its own README with deeper detail.

## Quick start (backend)

```bash
cd 12_Backend
npm install
cp .env.example .env  # fill in JWT_SECRET, DATABASE_URL
npm test              # 91 tests pass
npm run dev           # listens on :3001
```

## Quick start (Android)

```bash
cd android-app
./gradlew :app:assembleDebug \
  -PapiBaseUrl=http://10.0.2.2:3001/   # emulator alias for host
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

For a hosted backend:

```bash
./gradlew :app:assembleRelease \
  -PapiBaseUrl=https://api.your-domain.example/
```

## Hosting

See `12_Backend/README.md` → "Hosting" section. We provide
`Dockerfile`, `render.yaml`, and `deploy/cloud-run.example.json`
out of the box.
