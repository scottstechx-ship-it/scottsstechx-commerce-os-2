// ScottsTechX Commerce OS — Android client (buyer + seller MVP)
// v0.21.0 highlights (Android client changes):
//   1. Bumped versionCode → 40, versionName → 0.21.0.
//   2. Manifest: removed `usesCleartextTraffic="true"` (was overridden by
//      network-security-config anyway, but the attribute was misleading).
//   3. Added POST_NOTIFICATIONS permission for Android 13+ runtime opt-in.
//   4. Added AppCenter-friendly NetworkMonitor (ConnectivityManager) for
//      the offline banner.
//   5. AuthInterceptor now strips the Authorization header from log
//      output and adds an Idempotency-Key helper.
//   6. New `ScottsTechXApp` composable with a working navigation graph
//      (onboarding → login/sign-in → role-aware dashboard → settings +
//      profile). The v0.18.0 smali carried a full graph; this Kotlin
//      port is the minimum viable subset that compiles and runs.
//   7. Certificate-pinner now reads from BuildConfig so the production
//      host can be pinned at build time without code changes.
// v0.11.2 highlights (server + web changes baked in):
//   1. Backend: .env loader fix (was previously startup-only via spawn env,
//      now `import "dotenv/config"` runs on every cold start). AI is live.
//   2. Backend: removed hardcoded DATABASE_URL from .env so the embedded
//      Postgres can come up before migrations run.
//   3. Backend: embedded Postgres dataDir now persists across tsx watch
//      reloads (cached on globalThis), old handle is stopped before a
//      new one binds to 5433.
//   4. Backend: /api/v1/audit/logs + /api/v1/audit/verify registered
//      (admin-only; the module existed but the route was never wired).
//   5. Backend: /api/v1/seller/dashboard now aliases /api/v1/seller/stats
//      so older APK builds that hit the singular path don't 404.
//   6. Backend: AI (customer-chat + assistant) is now grounded against
//      the live product catalog + nearby sellers. Hallucinations like
//      "cassava leaves 50 UGX" are gone. Fixed broken PostGIS query
//      in the unified assistant route — replaced with haversine on
//      seller_profiles.lat/lng.
//   7. Backend: Idempotency-Key is now optional on /orders/checkout and
//      /seller/products/v2 — auto-derives from sha256(userId+body).
//   8. Backend: Google auth returns clean 401 on bad tokens instead of
//      leaking 500 with jose internals.
//   9. Backend: Stripe webhook + dev-mock-token Google paths still work
//      (GOLD trust tier on mock-token sign-in, no real OAuth needed).
//  10. Web: CSS @import moved above @tailwind directives (was killing
//      the entire Vite build with ERR_CONNECTION_REFUSED on every page).
//  11. Web: Login demo buttons no longer use literal-asterisk phones
//      ("+256****0001" etc) that never existed in the seed. Real digit
//      numbers from migration 0009 are now baked in.
//  13. Web: Checkout form sends snake_case (product_id, qty,
//      delivery_address, payment_method, payment_phone) to match the
//      server Zod schema — was rejected with 400 before.
// v0.8.0 highlights (kept for reference):
//   1. Backend DB password fixed (was "***" placeholder)
//   2. Seeded phone numbers now use real digits (no more literal *)
//   3. Login route accepts admin role
//   4. /products, /sellers/nearby, /sellers/:id are now public
//   5. ZERO runtime permissions (camera + location removed)
//   6. Login: show/hide password, 1-tap demo accounts, enhanced UX
//   8. ProfileScreen, FeedbackSheet, FindItForMeSheet (already in v0.7.0)
//   9. BuyerDashboard with search bar, category chips, parallax hero
//  10. SellerDashboard with animated V2 layout, FAB add product
// Single-module Compose app. Splitting into :feature-buyer, :feature-seller,
// :core-data, :core-ui can come later once the modular-monolith is green.

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.scottstechx.commerceos"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.scottstechx.commerceos"
        minSdk = 26
        targetSdk = 34
        versionCode = 40
                        versionName = "0.21.0"

        // API base URL is wired in via BuildConfig so the same APK can point
        // at staging or local dev. Read the -PapiBaseUrl=... property once
        // and reuse it across defaultConfig + every buildType so the CLI
        // override actually wins.
        //
        // Default points at the developer's LAN IP so a real Android
        // device on the same Wi-Fi can reach the Fastify backend without
        // requiring a Cloudflare tunnel. Override at the CLI with
        //   gradle assembleDebug -PapiBaseUrl=https://other-host/
        val apiBaseUrl: String =
            (project.findProperty("apiBaseUrl") as String?) ?: "http://192.168.5.1:3001/"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
                buildConfigField("String", "API_BASE_URL_EMULATOR", "\"http://10.0.2.2:3001/\"")
                // Google OAuth Web Client ID. The user supplied this from the
                // Google Cloud Console. CredentialManager needs it to fetch the
                // default_web_client_id resource. Override via -PgoogleWebClientId=
                // at the CLI for dev/staging. When this is set, [GoogleSignInHelper]
                // uses the REAL CredentialManager One-Tap flow instead of the
                // dev-mock fallback.
                val googleWebClientId: String =
                    (project.findProperty("googleWebClientId") as String?)
                        ?: "824620346005-30d0fp43535rlp4j90gqmpv2l1apc6t6.apps.googleusercontent.com"
                buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
                // Marketing share-link base. Same env-override mechanism.
                val marketingBaseUrl: String =
                    (project.findProperty("marketingBaseUrl") as String?) ?: "https://scottstechx.example/"
                buildConfigField("String", "MARKETING_BASE_URL", "\"$marketingBaseUrl\"")

                // v0.21.0: Certificate-pinning hosts and pins. Override via
                //   -PapiPinHost=api.example.com
                //   -PapiPinPrimary=base64pin==
                //   -PapiPinBackup=base64pin==
                // When the primary is "UNSET" (default), the NetworkModule
                // skips pinning entirely. This is the safe initial value —
                // production builds should set real pins via the CI env.
                val apiPinHost: String =
                    (project.findProperty("apiPinHost") as String?) ?: ""
                val apiPinPrimary: String =
                    (project.findProperty("apiPinPrimary") as String?) ?: "UNSET"
                val apiPinBackup: String =
                    (project.findProperty("apiPinBackup") as String?) ?: "UNSET"
                buildConfigField("String", "API_PIN_HOST", "\"$apiPinHost\"")
                buildConfigField("String", "API_PIN_PRIMARY", "\"$apiPinPrimary\"")
                buildConfigField("String", "API_PIN_BACKUP", "\"$apiPinBackup\"")

                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        debug {
                    isMinifyEnabled = false
                    // 10.0.2.2 = the host machine as seen from the Android emulator.
                    // 3001 matches 12_Backend/src/server.ts default PORT.
                    // Allow -PapiBaseUrl override; fall back to the LAN IP
                    // (192.168.5.1 — developer's Wi-Fi adapter) so a real
                    // device works out of the box.
                    val debugUrl: String =
                        (project.findProperty("apiBaseUrl") as String?) ?: "http://192.168.5.1:3001/"
                    buildConfigField("String", "API_BASE_URL", "\"$debugUrl\"")
                    applicationIdSuffix = ".debug"
                    versionNameSuffix = "-debug"
                }
                release {
                    isMinifyEnabled = true
                    isShrinkResources = true
                    // R8 full mode strips dead code AND rewrites for size; the
                    // `proguard-android-optimize.txt` rules enable the
                    // additional peephole optimizations. Custom rules in
                    // `proguard-rules.pro` keep Hilt-generated entry points,
                    // @Serializable data classes (kotlinx.serialization needs
                    // them), and the Credential Manager reflection paths.
                    proguardFiles(
                        getDefaultProguardFile("proguard-android-optimize.txt"),
                        "proguard-rules.pro"
                    )
                    // Real release should resolve API_BASE_URL from BuildConfigField
                    // injected by the CI environment via -PapiBaseUrl=https://...
                    val releaseUrl: String =
                        (project.findProperty("apiBaseUrl") as String?) ?: "https://priest-subsection-isolation-reliable.trycloudflare.com/"
                    buildConfigField("String", "API_BASE_URL", "\"$releaseUrl\"")
                }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // Treat warnings about experimental APIs as errors only in CI; local dev
        // is more lenient. Flip freely.
        freeCompilerArgs = listOf("-opt-in=kotlin.RequiresOptIn")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

// Hilt 2.51.1 + KSP 2.0.20 had a multi-round FileAlreadyExistsException bug.
// Hilt 2.52 fixes it; nothing needed here.
ksp {
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.coroutines.android)

    // Compose (BOM-aligned)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // Permissions (runtime permission flow in Compose)
    implementation(libs.accompanist.permissions)

    // Google Play Services
    // - play-services-location: real GPS via FusedLocationProvider (Buyer nearby).
    // - play-services-integrity: REMOVED — no published artifact at any recent version on
    //   Google Maven. PlayIntegrityClient.kt falls back to a no-op (returns null token) so the
    //   rest of the app works fine; the tamper signal is weaker until this is re-added with a
    //   verified coordinate.
    implementation(libs.play.services.location)

    // Credential Manager + Google Identity (One-Tap Sign-In)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)

    // Storage
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // CameraX
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    // Image loading
    implementation(libs.coil.compose)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.kotlinx.serialization)

    // Logging
    implementation(libs.timber)

    // Unit tests
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.kotlinx.coroutines.android)

    // Instrumentation tests
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
