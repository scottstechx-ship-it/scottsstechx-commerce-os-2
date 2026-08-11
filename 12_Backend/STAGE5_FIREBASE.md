# Stage 5 — Firebase integration

This stage makes ScottsTechX a real, persistent app by adding
Firebase as the mobile-side source of truth, while keeping the
existing Fastify + Postgres backend for server-side admin and
AI.

## What was added

### Backend (`12_Backend/`)

- `src/firebase/admin.ts` — lazy `firebase-admin` initializer.
  Reads the service-account key from `secrets/firebase-admin-key.json`
  (gitignored). Project ID: `scottstechx-52bab`.
- `src/firebase/auth-middleware.ts` — accepts both Firebase ID
  tokens and the existing HS256 JWT. Auto-provisions a `users` row
  for new Firebase sign-ins. Requires `email_verified = true`.
- `src/firebase/storage.ts` — signed-URL helpers (15-min TTL)
  for chat media, product images, and avatars.
- `src/firebase/mirror.ts` — best-effort write-through to Firestore
  for every user-facing mutation.
- `src/modules/auth/firebase-auth.route.ts` — the bridge:
  - `POST /api/v1/auth/firebase/sign-in`
  - `POST /api/v1/auth/firebase/send-verification-email`
  - `GET /api/v1/auth/firebase/me`
  - `POST /api/v1/auth/firebase/upgrade-to-seller`
- `src/modules/chat/chat-v2.route.ts` — chat v2 with media + threads:
  - `POST /api/v1/chat/v2/upload-url`
  - `POST /api/v1/chat/v2/messages`
  - `GET /api/v1/chat/v2/conversations`
  - `POST /api/v1/chat/v2/conversations/:cid/read`
- `src/modules/products/products-v2.route.ts` — image upload:
  - `POST /api/v1/products/v2/upload-image-url`
  - `POST /api/v1/products/v2/:id/set-image`
  - `POST /api/v1/products/v2/:id/mirror`
- `src/modules/sellers/nearby-v2.route.ts` — real geolocation:
  - `POST /api/v1/sellers/v2/update-location`
  - `GET /api/v1/sellers/v2/nearby` (cube + Haversine fallback)
- `src/modules/ai/ai-v2.route.ts` — server-side AI:
  - `POST /api/v1/ai/v2/ask` (OpenAI/Gemini/Groq with mock fallback)
- `src/modules/settings/settings-v2.route.ts` — settings persistence:
  - `GET /api/v1/settings/v2`
  - `PUT /api/v1/settings/v2`
- `src/modules/memory/memory-v2.route.ts` — AI memory persistence:
  - `GET /api/v1/memory/v2/ai`
  - `POST /api/v1/memory/v2/ai/signal`
  - `POST /api/v1/memory/v2/ai/clear`
- `migrations/0022_firebase_auth_integration.sql` — adds
  `users.firebase_uid`, `users.email_verified`, `users.last_seen_at`,
  `products.image_url_signed`, `chat_messages.attachment_url/mime`,
  `thread_parent_id`, `deleted_at`, `read_by`.
- `migrations/0023_user_settings_ai_memory.sql` — `user_settings`
  and `ai_personalization` tables with RLS.
- `firebase.json` — Firebase project config (rules paths, emulator
  ports).
- `firebase/rules/firestore.rules` — per-user read/write rules.
- `firebase/rules/storage.rules` — chat media (participant-only),
  product images (public read), avatars (public read).
- `firebase/indexes/firestore.indexes.json` — `conversations.updatedAt`,
  `messages.createdAt`, `products.category+updatedAt`,
  `sellers.lat+lng`.
- `secrets/firebase-admin-key.json` — service-account key (gitignored).
  Comes from the file the user uploaded.
- `.env.example` updated with `FIREBASE_ADMIN_KEY_PATH`.
- `.gitignore` updated with `**/secrets/`, `12_Backend/secrets/`.

### Android (`scottsx-android/`)

- `app/google-services.json` (already in place) — Firebase project
  config for `scottstechx-52bab` / app `com.scottsx.app`.
- `gradle/libs.versions.toml` — added `firebase-storage` alias.
- `app/build.gradle.kts` — added `implementation(libs.firebase.storage)`.
- `data/domain/MarketplaceModels.kt` — `SessionCache` extended with
  `firebaseUid` field + `firebaseUidOrNull()` accessor.
- `data/firebase/FirebaseBridge.kt` — lazy Firebase SDK singletons.
- `data/firebase/FirebaseAuthRepository.kt` — Google sign-in +
  email-verification helpers. Reads backend profile, mirrors to
  SessionCache.
- `data/firebase/Mirror.kt` — best-effort write-through of
  TransactionStore / Receipt / Dispute / Timeline / AI memory to
  Firestore subcollections under each user's tree.
- `data/TransactionStore.kt` — every mutating method now calls
  `Mirror.transaction()` / `Mirror.receipt()` / `Mirror.dispute()`.
- `ai/AiPersonalizationStore.kt` — every mutator now calls
  `Mirror.aiMemory()`.

## Deploy

1. **Backend env**: copy `.env.example` to `.env`, set
   `JWT_SECRET`, `DATABASE_URL`. Leave `FIREBASE_ADMIN_KEY_PATH`
   unset if you want routes to return 503 when Firebase isn't
   configured (recommended for first deploy).
2. **Firebase**: deploy rules via `firebase deploy --only firestore:rules,firestore:indexes,storage` (requires
   `firebase-tools` and `firebase login`).
3. **Run migrations**: `npm run dev` runs `runMigrations()` on
   boot. Migrations 0022 and 0023 apply automatically.

## AI provider

Set in `.env`:
```
AI_PROVIDER=gemini
LLM_API_KEY=<your Gemini API key from aistudio.google.com>
AI_MODEL=gemini-2.5-flash
```

Other supported providers: `groq`, `openai`, `openrouter`,
`apifreellm`. Without any provider, the AI route returns a
deterministic mock labeled as `[AI suggestion]`.

## Layout reference (Firestore)

```
/users/{uid}
    /transactions/{txId}
    /receipts/{receiptNumber}
    /disputes/{disputeId}
    /timeline/{eventId}
    /ai_history/{msgId}
    /ai_memory/main
    /settings/main
    /wishlist/{productId}
    /inbox/{conversationId}
/products/{productId}
/sellers/{sellerId}
/conversations/{conversationId}
    /messages/{messageId}
```

Storage paths:
```
gs://scottstechx-52bab.appspot.com/chat/{cid}/{msgId}.{ext}
gs://scottstechx-52bab.appspot.com/products/{sellerId}/{productId}/{uuid}.{ext}
gs://scottstechx-52bab.appspot.com/receipts/{receiptNumber}.png
gs://scottstechx-52bab.appspot.com/avatars/{userId}/{uuid}.{ext}
```
