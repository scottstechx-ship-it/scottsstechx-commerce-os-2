package com.scottsx.app.data

import com.scottsx.app.data.domain.SessionCache

/**
 * Single helper for ending a session — used by every "Sign Out" entry
 * point in the app (Buyer settings, Seller settings, Profile nav,
 * automatic sign-out on role mismatch, etc.). Keeps the multi-step
 * sign-out dance in one place so we cannot accidentally skip the
 * Google clear or the local SessionCache clear.
 *
 * Usage:
 * ```
 * Session.signOut(authRepository, googleHelper)
 * ```
 *
 * Wrapped internally so callers don't need to know which subsystems
 * need cleaning. If [googleHelper] is null (e.g. the user never
 * signed in with Google) the Google clear is silently skipped.
 */
object Session {
    suspend fun signOut(
        authRepository: AuthRepository,
        googleHelper: GoogleSignInHelper? = null,
    ) {
        // 1. Firebase Auth — clears the active credential.
        runCatching { authRepository.signOut() }
        // 2. Google sign-in SDK — clears the cached id_token so
        //    the next "Sign in with Google" tap forces the picker
        //    instead of silently resuming the previous account.
        googleHelper?.let { runCatching { it.signOut() } }
        // 3. Local role/profile cache.
        SessionCache.clear()
    }
}
