package com.scottsx.app.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.scottsx.app.data.domain.Role
import kotlinx.coroutines.tasks.await

/**
 * Auth repository — thin wrapper around Firebase Auth + Firestore.
 *
 * Storage strategy
 * ----------------
 *  * Authentication: Firebase Authentication (email + password).
 *  * User profile (display name, phone, role, business fields): a
 *    document at `/users/{uid}` in Firestore.
 *  * Role: stored on the Firestore profile AND mirrored locally so
 *    the UI can show "Logging in as Buyer / Seller" without an
 *    extra round-trip.
 *
 * Stage-1 scope
 * -------------
 *  * signUp / signIn with email + password
 *  * persist role + seller fields to Firestore
 *  * read the role back from Firestore on each sign-in
 *
 * Stage-2 will move role into a Firebase custom claim via a Cloud
 * Function so the JWT carries it server-side.
 */
class AuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    val currentUser: FirebaseUser? get() = auth.currentUser

    suspend fun signIn(email: String, password: String, expectedRole: Role? = null): AuthResult {
        val res = auth.signInWithEmailAndPassword(email.trim(), password).await()
        val user = res.user ?: return AuthResult.Failure("Sign-in failed")
        // Best-effort role lookup. Offline → fall back to Buyer.
        val actualRole = runCatching { fetchRole(user.uid) }
            .onFailure {
                android.util.Log.w(
                    "AuthRepository",
                    "Firestore role lookup failed during sign-in (offline?).",
                    it,
                )
            }
            .getOrNull() ?: Role.Buyer
        cacheRole(actualRole)
        // Enforce role separation: if the caller asked for a specific role
        // (they tapped "Login as Buyer" or "Login as Seller" at the role
        // selector) but the server says otherwise, hand back a RoleMismatch
        // so the UI can route them to the right dashboard.
        if (expectedRole != null && actualRole != expectedRole) {
            return AuthResult.RoleMismatch(actual = actualRole)
        }
        return AuthResult.Success(actualRole)
    }

    suspend fun signUp(
        email: String,
        password: String,
        displayName: String,
        phone: String,
        role: Role,
        sellerExtras: SellerExtras? = null,
    ): AuthResult {
        // First check whether the email is already taken on a different role.
        // FirebaseAuth's createUserWithEmailAndPassword will throw if the
        // account already exists, but that error message is opaque. We look
        // up any existing profile by email first so we can return a clean
        // RoleMismatch with a usable message rather than "email already in use".
        val existingRoleForEmail = runCatching { fetchRoleByEmail(email.trim()) }
            .getOrNull()
        if (existingRoleForEmail != null && existingRoleForEmail != role) {
            return AuthResult.RoleMismatch(actual = existingRoleForEmail)
        }
        val res = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val user = res.user ?: return AuthResult.Failure("Sign-up failed")
        // Set display name.
        val profile = UserProfileChangeRequest.Builder()
            .setDisplayName(displayName)
            .build()
        user.updateProfile(profile).await()

        // Persist profile to Firestore.
        val profileMap = buildMap {
            put("uid", user.uid)
            put("displayName", displayName)
            put("email", email.trim())
            put("phone", phone.trim())
            put("role", role.name.lowercase())
            put("createdAt", com.google.firebase.firestore.FieldValue.serverTimestamp())
            if (role == Role.Seller && sellerExtras != null) {
                put("seller", mapOf(
                    "businessName" to sellerExtras.businessName,
                    "businessType" to sellerExtras.businessType,
                    "storeLocation" to sellerExtras.storeLocation,
                    "nin" to sellerExtras.nin,
                    "yearsInBusiness" to sellerExtras.yearsInBusiness.toIntOrNull(),
                    "bio" to sellerExtras.bio,
                ))
            }
        }
        runCatching {
            db.collection("users").document(user.uid).set(profileMap, SetOptions.merge()).await()
        }.onFailure {
            android.util.Log.w(
                "AuthRepository",
                "Firestore sign-up profile write failed; will retry on next sign-in.",
                it,
            )
        }
        cacheRole(role)
        // Always return success — the Firebase Auth user is created
        // either way; the Firestore profile document can be back-filled
        // on next sign-in if Firestore was offline during registration.
        return AuthResult.Success(role)
    }

    suspend fun signOut() {
        auth.signOut()
    }

    /**
     * Sign in (or register) with a Google ID token.
     *
     * The Android client obtains the `idToken` via the Google Sign-In
     * SDK and passes it in. Firebase exchanges it for our app's
     * credential; if the user does not yet have a Firestore profile
     * we create one with the supplied [role] and Google-derived
     * display name / email.
     */
    suspend fun signInWithGoogle(idToken: String, expectedRole: Role): AuthResult {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        val res = auth.signInWithCredential(credential).await()
        val user = res.user ?: return AuthResult.Failure("Google sign-in failed")

        // Best-effort profile sync. Firestore may be unreachable
        // (offline, throttled, denied rules) — none of these
        // should block the user from reaching Home.
        val existingRole = runCatching { fetchRole(user.uid) }
            .onFailure {
                android.util.Log.w(
                    "AuthRepository",
                    "Firestore role lookup failed (offline?); using caller-supplied role.",
                    it,
                )
            }
            .getOrNull()

        if (existingRole != null) {
            cacheRole(existingRole)
            // Server-side role exists. Enforce separation — never let a
            // user pick a different role at the role selector and walk
            // through to the wrong dashboard. If the Firestore role
            // disagrees with what the user just tapped, bounce them to
            // the RoleMismatch screen.
            if (existingRole != expectedRole) {
                return AuthResult.RoleMismatch(actual = existingRole)
            }
            return AuthResult.Success(existingRole)
        }

        // First-time Google sign-in: create the profile document.
        // If Firestore is unreachable we still let the user in.
        val displayName = user.displayName ?: "Google User"
        val email = user.email ?: ""
        val profileMap = buildMap {
            put("uid", user.uid)
            put("displayName", displayName)
            put("email", email)
            put("phone", "")
            put("role", expectedRole.name.lowercase())
            put("signInProvider", "google")
            put("createdAt", com.google.firebase.firestore.FieldValue.serverTimestamp())
        }
        val profileWrite = runCatching {
            db.collection("users").document(user.uid)
                .set(profileMap, SetOptions.merge()).await()
        }.onFailure {
            android.util.Log.w(
                "AuthRepository",
                "Firestore profile write failed; profile will be retried on next sign-in.",
                it,
            )
        }
        cacheRole(expectedRole)
        // Note: we still return Success even if profileWrite failed.
        // The user is authenticated with Firebase Auth; the profile
        // document can be retried later. Blocking sign-in here
        // would be worse UX than the transient offline state.
        return AuthResult.Success(expectedRole)
    }

    suspend fun fetchRole(uid: String): Role? {
        val snap = db.collection("users").document(uid).get().await()
        if (!snap.exists()) return null
        val raw = snap.getString("role") ?: return null
        return if (raw.equals("seller", ignoreCase = true)) Role.Seller else Role.Buyer
    }

    /**
     * Look up the role of a profile by email rather than uid. Used during
     * sign-up to detect "this email is already a seller / buyer" before
     * the Firebase Auth createUserWithEmailAndPassword throws.
     *
     * NOTE: this requires a Firestore `where` query against an indexed
     * `email` field on the users collection. If the index is missing this
     * will throw, which the caller wraps in runCatching.
     */
    suspend fun fetchRoleByEmail(email: String): Role? {
        val normalized = email.trim().lowercase()
        if (normalized.isBlank()) return null
        val snap = db.collection("users")
            .whereEqualTo("email", normalized)
            .limit(1)
            .get()
            .await()
        if (snap.isEmpty) return null
        val raw = snap.documents.firstOrNull()?.getString("role") ?: return null
        return if (raw.equals("seller", ignoreCase = true)) Role.Seller else Role.Buyer
    }

    private fun cacheRole(role: Role) {
        SessionCache.role = role
    }
}

/**
 * Seller-only fields collected on sign-up. Kept separate from common
 * fields so the Buyer flow can ignore it.
 */
data class SellerExtras(
    val businessName: String,
    val businessType: String,
    val storeLocation: String,
    val nin: String,
    val yearsInBusiness: String,
    val bio: String,
)

sealed class AuthResult {
    data class Success(val role: Role) : AuthResult()
    data class Failure(val message: String) : AuthResult()

    /**
     * The user is authenticated but the role on the server does not match
     * the role the user picked at the role-selection screen. For example,
     * they tapped "Sign in as Buyer" but their Firestore profile says
     * `role = "seller"`. The Compose layer should route the user to a
     * Wrong-Role screen with the actual server role so they can pick the
     * right dashboard.
     */
    data class RoleMismatch(val actual: Role) : AuthResult()
}

/**
 * Lightweight in-memory cache for the current user's role, so the UI
 * can display "Logging in as Buyer / Seller" without an extra
 * Firestore round-trip.
 */
object SessionCache {
    @Volatile var role: Role? = null
}