package com.scottsx.app.data.domain

/**
 * Stage-2 marketplace domain models.
 *
 * These types are intentionally backend-ready so the data layer
 * can be swapped from the in-memory [MarketplaceDataSource] (used
 * today) to a real Firestore / REST client later without touching
 * the UI layer.
 */

enum class Role(val displayName: String, val tagline: String) {
    Buyer(
        displayName = "Buyer",
        tagline = "Discover products and connect with sellers across Uganda.",
    ),
    Seller(
        displayName = "Seller",
        tagline = "List your products, reach more customers, and grow your business.",
    );

    companion object {
        fun fromName(s: String?): Role = if (s.equals("Seller", true)) Seller else Buyer
    }
}

enum class ProductCategory(val displayName: String, val icon: String) {
    All("All", "all"),
    Electronics("Electronics", "electronics"),
    Fashion("Fashion", "fashion"),
    HomeLiving("Home & Living", "home"),
    Beauty("Beauty", "beauty"),
    Sports("Sports", "sports"),
    Groceries("Groceries", "groceries"),
    Automotive("Automotive", "auto"),
    More("More", "more");

    companion object {
        fun fromKey(s: String?): ProductCategory =
            values().firstOrNull { it.name.equals(s, true) } ?: All
    }
}

data class Brand(
    val id: String,
    val name: String,
)

data class Seller(
    val id: String,
    val name: String,
    val rating: Float = 4.5f,
    val location: String = "Kampala",
    val verified: Boolean = false,
)

data class Product(
    val id: String,
    val name: String,
    val shortDescription: String,
    val description: String,
    val priceUgx: Long,
    val oldPriceUgx: Long? = null,
    val category: ProductCategory,
    val brand: Brand,
    val seller: Seller,
    val imageUrl: String,
    val stock: Int = 10,
    val rating: Float = 4.4f,
    val ratingCount: Int = 32,
    val isFlashDeal: Boolean = false,
    val discountPercent: Int = 0,
    val location: String = "Kampala",
)

data class HeroBanner(
    val id: String,
    val title: String,
    val subtitle: String,
    val supportingText: String,
    val cta: String,
    val background: BannerBackground,
)

sealed class BannerBackground {
    object BluePurple : BannerBackground()
    object DarkNavy : BannerBackground()
    object GreenTeal : BannerBackground()
    object Sunset : BannerBackground()
}

data class CartItem(
    val productId: String,
    val quantity: Int = 1,
)

data class WishlistItem(
    val productId: String,
)

data class BuyerProfile(
    val uid: String,
    val displayName: String,
    val email: String,
    val avatarUrl: String? = null,
    val cartCount: Int = 0,
    val notificationCount: Int = 0,
    val wishlistCount: Int = 0,
)

data class Notification(
    val id: String,
    val title: String,
    val body: String,
    val timestampLabel: String,
    val isUnread: Boolean = true,
)

data class Benefit(
    val title: String,
    val subtitle: String,
    val iconKind: BenefitIcon,
)

enum class BenefitIcon { Delivery, Security, Returns, Protection }

/**
 * In-memory session cache. Lets the app remember the
 * currently-signed-in user's role without round-tripping through
 * Firebase on every nav. Cleared on sign-out.
 */
object SessionCache {
    @Volatile var role: Role? = null
    @Volatile var displayName: String? = null
    @Volatile var email: String? = null

    /**
     * Atomically set the role + display name + email for the current
     * session. Safe to call from any thread.
     *
     * Empty / null displayName is replaced with a non-empty placeholder
     * ("Buyer" / "Seller" / "Google User") so route construction that
     * uses [displayName] never produces a path with an empty segment
     * (which Navigation Compose rejects with IllegalArgumentException
     * "cannot be found in the navigation graph").
     *
     * Empty / null email is preserved as "" — the route argument
     * already defaults to "" and the encoder encodes "" to "".
     */
    fun set(role: Role, displayName: String?, email: String?) {
        this.role = role
        this.displayName = when {
            displayName.isNullOrBlank() -> when (role) {
                Role.Seller -> "Seller"
                Role.Buyer -> "Buyer"
            }
            else -> displayName
        }
        this.email = email ?: ""
    }

    fun clear() {
        role = null
        displayName = null
        email = null
    }
}
