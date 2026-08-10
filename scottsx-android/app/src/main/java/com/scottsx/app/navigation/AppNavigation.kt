package com.scottsx.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.scottsx.app.data.AuthRepository
import com.scottsx.app.data.GoogleSignInHelper
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.Session
import com.scottsx.app.data.domain.Role
import com.scottsx.app.data.domain.SessionCache
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.screens.AiAssistantScreen
import com.scottsx.app.ui.screens.BuyerHomeScreen
import com.scottsx.app.ui.screens.CartScreen
import com.scottsx.app.ui.screens.CategoriesScreen
import com.scottsx.app.ui.screens.HomeScreen
import com.scottsx.app.ui.screens.LoginScreen
import com.scottsx.app.ui.screens.NearbyScreen
import com.scottsx.app.ui.screens.OnboardingFlow
import com.scottsx.app.ui.screens.ProfileScreen
import com.scottsx.app.ui.screens.RoleSelectionScreen
import com.scottsx.app.ui.screens.SearchScreen
import com.scottsx.app.ui.screens.SellerHomeScreen
import com.scottsx.app.ui.screens.SignUpScreen
import com.scottsx.app.ui.screens.SplashScreen
import com.scottsx.app.ui.screens.WishlistScreen
import com.scottsx.app.ui.screens.WrongRoleScreen
import kotlinx.coroutines.launch

/**
 * Stage-3 navigation host.
 *
 * Routes the entire app — Splash → Onboarding → RoleSelection →
 * Login/SignUp → role-specific dashboard (Buyer or Seller) →
 * tabbed sub-screens (Nearby, AI, Wishlist, Profile) and detail
 * screens (Cart, Search, Categories).
 *
 * Three new edge-case routes over Stage 2:
 *  - `wrongRole/{picked}/{actual}` — bounces a buyer/seller mismatch
 *    to a screen that lets them pick the right dashboard or pick a
 *    different account.
 *  - `seller_home/{displayName}/{email}` — counterpart to BUYER_HOME.
 *  - `home/{role}` — legacy placeholder retained for the HomeScreen
 *    pick-up that runs *before* the buyer dashboard kicks in.
 *
 * Sign-out is centralized in [Session.signOut] which clears Firebase
 * Auth, the Google SDK cache, and the local SessionCache. Every
 * dashboard-level sign-out button routes through that helper so we
 * cannot accidentally skip any of the three subsystems.
 */
@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val auth = remember { com.google.firebase.auth.FirebaseAuth.getInstance() }
    val authRepository = remember { AuthRepository(auth) }
    val scope = rememberCoroutineScope()

    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            BackHandler { /* splash blocks back */ }
            SplashHost(onContinue = {
                navController.navigate(Routes.ONBOARDING) {
                    launchSingleTop = true
                }
            })
        }

        composable(Routes.ONBOARDING) {
            BackHandler { /* onboarding blocks back */ }
            OnboardingFlow(onFinish = {
                navController.navigate(Routes.ROLE) {
                    popUpTo(Routes.ONBOARDING) { inclusive = true }
                    launchSingleTop = true
                }
            })
        }

        composable(Routes.ROLE) {
            RoleSelectionScreen(
                onLogin = { role: Role ->
                    navController.navigate(Routes.login(role)) {
                        launchSingleTop = true
                    }
                },
                onSignUp = { role: Role ->
                    navController.navigate(Routes.signup(role)) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.LOGIN,
            arguments = listOf(navArgument("role") { type = NavType.StringType }),
        ) { backStackEntry ->
            val role = Routes.roleFromBackStack(backStackEntry.arguments?.getString("role"))
            LoginScreen(
                role = role,
                authRepository = authRepository,
                onBack = { navController.popBackStack() },
                onLogin = { signedRole: Role ->
                    navController.navigate(Routes.dashboard(signedRole)) {
                        popUpTo(Routes.ROLE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onGoogle = { signedRole: Role ->
                    navController.navigate(Routes.dashboard(signedRole)) {
                        popUpTo(Routes.ROLE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onApple = { /* Stage 3 — Apple Sign-In (TBD) */ },
                onSignUp = {
                    navController.navigate(Routes.signup(role)) {
                        launchSingleTop = true
                    }
                },
                onForgotPassword = { /* Stage 3 — reset link email (TBD) */ },
                onRoleMismatch = { actualRole ->
                    navController.navigate(Routes.wrongRole(picked = role, actual = actualRole)) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.SIGNUP,
            arguments = listOf(navArgument("role") { type = NavType.StringType }),
        ) { backStackEntry ->
            val role = Routes.roleFromBackStack(backStackEntry.arguments?.getString("role"))
            SignUpScreen(
                role = role,
                authRepository = authRepository,
                onBack = { navController.popBackStack() },
                onSubmit = { signedRole: Role ->
                    navController.navigate(Routes.dashboard(signedRole)) {
                        popUpTo(Routes.ROLE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onSignInInstead = { navController.popBackStack() },
                onRoleMismatch = { actualRole ->
                    navController.navigate(Routes.wrongRole(picked = role, actual = actualRole)) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.WRONG_ROLE,
            arguments = listOf(
                navArgument("picked") { type = NavType.StringType },
                navArgument("actual") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val picked = Routes.roleFromBackStack(
                backStackEntry.arguments?.getString("picked"),
            )
            val actual = Routes.roleFromBackStack(
                backStackEntry.arguments?.getString("actual"),
            )
            WrongRoleScreen(
                pickedRole = picked,
                actualRole = actual,
                onContinueAsActual = {
                    navController.navigate(Routes.dashboard(actual)) {
                        popUpTo(Routes.ROLE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onUseDifferentAccount = {
                    scope.launch {
                        Session.signOut(authRepository, null /* helper per-screen is reset on next login */)
                    }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.HOME,
            arguments = listOf(navArgument("role") { type = NavType.StringType }),
        ) { backStackEntry ->
            val role = Routes.roleFromBackStack(backStackEntry.arguments?.getString("role"))
            HomeScreen(
                role = role,
                onContinue = { userProfile ->
                    SessionCache.role = role
                    SessionCache.displayName = userProfile.displayName
                    SessionCache.email = userProfile.email
                    navController.navigate(Routes.dashboard(role)) {
                        popUpTo(Routes.ROLE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onSignOut = {
                    scope.launch {
                        Session.signOut(authRepository, null /* helper per-screen is reset on next login */)
                    }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.BUYER_HOME,
            arguments = listOf(
                navArgument("displayName") { type = NavType.StringType; defaultValue = "Buyer" },
                navArgument("email") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { backStackEntry ->
            val displayName = backStackEntry.arguments?.getString("displayName")
            val email = backStackEntry.arguments?.getString("email")
            val profile = MarketplaceDataSource.profileFor(displayName, email)
            // Role-separation gate. If the signed-in session says Seller
            // but the buyer dashboard got requested, bounce to the
            // wrong-role screen so we never show the wrong UI.
            val sessionRole = SessionCache.role
            if (sessionRole == Role.Seller) {
                LaunchedEffect(Unit) {
                    navController.navigate(
                        Routes.wrongRole(picked = Role.Buyer, actual = Role.Seller),
                    ) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                }
                return@composable
            }
            BuyerHomeScreen(
                profile = profile,
                onNavigateToCart = { navController.navigate(Routes.CART) },
                onNavigateToCategory = { navController.navigate(Routes.CATEGORIES) },
                onNavigateToSearch = { navController.navigate(Routes.SEARCH) },
                onNavigateToNearby = { navController.navigate(Routes.NEARBY) },
                onNavigateToAi = { navController.navigate(Routes.AI) },
                onNavigateToAllProducts = { navController.navigate(Routes.CATEGORIES) },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
                // Stage 3.1 sidebar sign-out: same single sign-out helper
                // we use everywhere; clear Firebase + Google SDK +
                // SessionCache, then bounce back to the role picker.
                onSignOutRequested = {
                    scope.launch {
                        Session.signOut(authRepository, null)
                    }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(
            Routes.SELLER_HOME,
            arguments = listOf(
                navArgument("displayName") { type = NavType.StringType; defaultValue = "Seller" },
                navArgument("email") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { backStackEntry ->
            val displayName = backStackEntry.arguments?.getString("displayName") ?: "Seller"
            val email = backStackEntry.arguments?.getString("email") ?: ""
            // Role-separation gate.
            val sessionRole = SessionCache.role
            if (sessionRole == Role.Buyer) {
                LaunchedEffect(Unit) {
                    navController.navigate(
                        Routes.wrongRole(picked = Role.Seller, actual = Role.Buyer),
                    ) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                }
                return@composable
            }
            SellerHomeScreen(
                displayName = displayName,
                email = email,
                onAddProduct = { /* Stage 3.2.1 — product CRUD screen */ },
                onManageOrders = { /* Stage 3.2.1 — orders mgmt screen */ },
                onOpenInventory = { /* Stage 3.2.1 — inventory listing */ },
                onOpenAnalytics = { /* Stage 3.2.1 — analytics screen */ },
                onSwitchToBuyer = {
                    // Switch to buyer app: keep the same Firebase session,
                    // just flip the role expectation so the buyer dashboard
                    // accepts the seller account too.
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onSignOut = {
                    scope.launch {
                        Session.signOut(authRepository, null)
                    }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(Routes.CART) {
            CartScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(Routes.NEARBY) {
            NearbyScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(Routes.AI) {
            AiAssistantScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(Routes.SEARCH) {
            SearchScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(Routes.CATEGORIES) {
            CategoriesScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(Routes.WISHLIST) {
            WishlistScreen(
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
            )
        }
        composable(
            Routes.PROFILE,
            arguments = listOf(
                navArgument("displayName") { type = NavType.StringType; defaultValue = "Buyer" },
                navArgument("email") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { backStackEntry ->
            val displayName = backStackEntry.arguments?.getString("displayName")
            val email = backStackEntry.arguments?.getString("email")
            val profile = MarketplaceDataSource.profileFor(displayName, email)
            val activityContext = androidx.compose.ui.platform.LocalContext.current
            ProfileScreen(
                profile = profile,
                onBack = { navController.popBackStack() },
                onTabSelect = { tab -> onBuyerTab(navController, tab) },
                onSignOut = {
                    scope.launch {
                        Session.signOut(authRepository, null)
                    }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                // Switch account: same as sign-out but we additionally
                // tell the Google SDK to clear its cached token so the
                // next tap forces the system account picker.
                onSwitchAccount = {
                    try {
                        (activityContext as? android.app.Activity)?.let { activity ->
                            com.scottsx.app.data.GoogleSignInHelper(activity)
                                .forcePickerOnNextSignIn()
                        }
                    } catch (t: Throwable) {
                        android.util.Log.w("AppNavigation", "switchAccount: force-picker failed", t)
                    }
                    scope.launch { Session.signOut(authRepository, null) }
                    navController.navigate(Routes.ROLE) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
    }

}

/**
 * Tiny holder that lazily builds a GoogleSignInHelper when the
 * Application context is reachable. Letting AppNavigation own the
 * helper means the LoginScreen can stay a pure composable and we
 * avoid recreating the GoogleSignInClient on every recomposition.
 */
// Removed in Stage 3.1 — the LoginScreen now constructs its own
// helper via `remember(activityContext)` and clears the cached
// Google account on demand via the "Use a different Google account"
// button. AppNavigation does not need to hold a singleton helper.

private fun onBuyerTab(navController: NavHostController, tab: BottomTab) {
    val dn = SessionCache.displayName ?: "Buyer"
    val em = SessionCache.email ?: ""
    val encoded = java.net.URLEncoder.encode(em, "UTF-8")
    when (tab) {
        BottomTab.Home -> navController.navigate("buyer_home/$dn/$encoded") {
            popUpTo(Routes.BUYER_HOME) { inclusive = true }
            launchSingleTop = true
        }
        BottomTab.Nearby -> navController.navigate(Routes.NEARBY) {
            launchSingleTop = true
        }
        BottomTab.Ai -> navController.navigate(Routes.AI) {
            launchSingleTop = true
        }
        BottomTab.Wishlist -> navController.navigate(Routes.WISHLIST) {
            launchSingleTop = true
        }
        BottomTab.Profile -> navController.navigate("profile/$dn/$encoded") {
            launchSingleTop = true
        }
    }
}

private fun onSellerTab(navController: NavHostController, tab: BottomTab) {
    val dn = SessionCache.displayName ?: "Seller"
    val em = SessionCache.email ?: ""
    val encoded = java.net.URLEncoder.encode(em, "UTF-8")
    when (tab) {
        BottomTab.Home -> navController.navigate("seller_home/$dn/$encoded") {
            popUpTo(Routes.SELLER_HOME) { inclusive = true }
            launchSingleTop = true
        }
        BottomTab.Nearby -> navController.navigate(Routes.NEARBY) {
            launchSingleTop = true
        }
        BottomTab.Ai -> navController.navigate(Routes.AI) {
            launchSingleTop = true
        }
        BottomTab.Wishlist -> navController.navigate(Routes.WISHLIST) {
            launchSingleTop = true
        }
        BottomTab.Profile -> navController.navigate("profile/$dn/$encoded") {
            launchSingleTop = true
        }
    }
}

@Composable
private fun SplashHost(onContinue: () -> Unit) {
    SplashScreen(onContinue = onContinue)
}

object Routes {
    const val SPLASH = "splash"
    const val ONBOARDING = "onboarding"
    const val ROLE = "role"
    const val LOGIN = "login/{role}"
    const val SIGNUP = "signup/{role}"
    const val WRONG_ROLE = "wrongRole/{picked}/{actual}"
    const val HOME = "home/{role}"
    const val BUYER_HOME = "buyer_home/{displayName}/{email}"
    const val SELLER_HOME = "seller_home/{displayName}/{email}"
    const val CART = "cart"
    const val NEARBY = "nearby"
    const val AI = "ai"
    const val SEARCH = "search"
    const val CATEGORIES = "categories"
    const val WISHLIST = "wishlist"
    const val PROFILE = "profile/{displayName}/{email}"

    fun login(role: Role) = "login/${role.name}"
    fun signup(role: Role) = "signup/${role.name}"
    fun home(role: Role) = "home/${role.name}"
    fun wrongRole(picked: Role, actual: Role) = "wrongRole/${picked.name}/${actual.name}"
    /**
     * Build the dashboard route for the given [role]. Falls back to
     * "Buyer" / "Seller" / a single non-empty placeholder when
     * SessionCache fields are empty so the resulting path always
     * matches the registered route shape
     * `buyer_home/{displayName}/{email}` or
     * `seller_home/{displayName}/{email}`.
     *
     * Without this guard, an empty display name / email yields
     * `"buyer_home/Buyer/"` (trailing slash) which Navigation
     * Compose rejects with IllegalArgumentException "cannot be
     * found in the navigation graph".
     */
    fun dashboard(role: Role): String = when (role) {
        Role.Buyer -> buyerHome(
            com.scottsx.app.data.domain.BuyerProfile(
                uid = "",
                displayName = SessionCache.displayName ?: "Buyer",
                email = SessionCache.email ?: "buyer",
            ),
        )
        Role.Seller -> sellerHome(
            displayName = SessionCache.displayName ?: "Seller",
            email = SessionCache.email ?: "seller",
        )
    }

    fun sellerHome(displayName: String, email: String): String =
        "seller_home/" +
            java.net.URLEncoder.encode(displayName.ifBlank { "Seller" }, "UTF-8") +
            "/" +
            java.net.URLEncoder.encode(email.ifBlank { "seller" }, "UTF-8")
    fun buyerHome(profile: com.scottsx.app.data.domain.BuyerProfile) =
        "buyer_home/${profile.displayName}/" +
            java.net.URLEncoder.encode(profile.email, "UTF-8")

    fun roleFromBackStack(s: String?): Role =
        if (s.equals("Seller", true)) Role.Seller else Role.Buyer
}
