package com.scottsx.app.data

import com.scottsx.app.data.domain.BannerBackground
import com.scottsx.app.data.domain.Benefit
import com.scottsx.app.data.domain.BenefitIcon
import com.scottsx.app.data.domain.Brand
import com.scottsx.app.data.domain.BuyerProfile
import com.scottsx.app.data.domain.HeroBanner
import com.scottsx.app.data.domain.Notification
import com.scottsx.app.data.domain.Product
import com.scottsx.app.data.domain.ProductCategory
import com.scottsx.app.data.domain.Seller

/**
 * Stage-2 in-memory marketplace data source.
 *
 * The brief says "Each slide must be configurable from backend
 * data later" and "Do not hardcode the promotional content into
 * the architecture." We honor that by keeping the data layer
 * behind this single object — a future commit can replace
 * [MarketplaceDataSource] with a Firestore / REST client without
 * touching the UI layer.
 *
 * Prices are real UGX (Ugandan Shillings) values, locations are
 * Uganda-relevant (Kampala, Entebbe, Jinja, Mbarara, Gulu), and
 * the products are sketched to be plausible Uganda marketplace
 * listings rather than random.
 */
object MarketplaceDataSource {

    // ---------------------------------------------------------------
    // Brands & sellers (kept tiny — each product reuses a stable id)
    // ---------------------------------------------------------------
    private val brandSamsung = Brand("samsung", "Samsung")
    private val brandApple = Brand("apple", "Apple")
    private val brandHp = Brand("hp", "HP")
    private val brandNike = Brand("nike", "Nike")
    private val brandAdidas = Brand("adidas", "Adidas")
    private val brandSafaricom = Brand("safaricom", "Safaricom")
    private val brandNewBalance = Brand("nb", "New Balance")
    private val brandKampalaCrafts = Brand("kc", "Kampala Crafts")
    private val brandPearl = Brand("pearl", "Pearl")
    private val brandHisense = Brand("hisense", "Hisense")
    private val brandMukwano = Brand("mukwano", "Mukwano")
    private val brandVivo = Brand("vivo", "Vivo")

    private val sellerTechHub = Seller("tech-hub", "Tech Hub Uganda", rating = 4.7f, location = "Kampala", verified = true)
    private val sellerFashionHouse = Seller("fashion-house", "Fashion House", rating = 4.5f, location = "Entebbe", verified = true)
    private val sellerSneakerKing = Seller("sneaker-king", "Sneaker King", rating = 4.4f, location = "Jinja")
    private val sellerHomeAppliances = Seller("home-appliances", "Home & Beyond", rating = 4.3f, location = "Kampala")
    private val sellerGlamour = Seller("glamour", "Glamour Cosmetics", rating = 4.6f, location = "Kampala", verified = true)
    private val sellerSporting = Seller("sporting-life", "Sporting Life", rating = 4.2f, location = "Mbarara")
    private val sellerPearlFresh = Seller("pearl-fresh", "Pearl Fresh Mart", rating = 4.4f, location = "Kampala")
    private val sellerAutoParts = Seller("auto-parts", "Auto Parts Pro", rating = 4.1f, location = "Kampala")
    private val sellerUgandaCrafts = Seller("uganda-crafts", "Uganda Crafts", rating = 4.8f, location = "Jinja", verified = true)

    // ---------------------------------------------------------------
    // Products
    // ---------------------------------------------------------------
    private val products: List<Product> = listOf(
        Product(
            id = "p-samsung-a15",
            name = "Samsung Galaxy A15",
            shortDescription = "128GB · 6.5\" AMOLED · 50MP",
            description = "Latest Samsung Galaxy A15 with AMOLED display and a 50MP triple camera. Long-lasting 5000mAh battery and 25W fast charging.",
            priceUgx = 1_150_000,
            oldPriceUgx = 1_350_000,
            category = ProductCategory.Electronics,
            brand = brandSamsung,
            seller = sellerTechHub,
            imageUrl = "phone",
            rating = 4.6f,
            ratingCount = 184,
            isFlashDeal = true,
            discountPercent = 15,
            location = "Kampala",
        ),
        Product(
            id = "p-apple-iphone13",
            name = "iPhone 13 (Refurb)",
            shortDescription = "128GB · Midnight · Unlocked",
            description = "Certified refurbished iPhone 13 with new battery, original Apple parts, 1-year warranty.",
            priceUgx = 2_950_000,
            oldPriceUgx = 3_400_000,
            category = ProductCategory.Electronics,
            brand = brandApple,
            seller = sellerTechHub,
            imageUrl = "phone",
            rating = 4.7f,
            ratingCount = 96,
            isFlashDeal = true,
            discountPercent = 13,
            location = "Kampala",
        ),
        Product(
            id = "p-hp-laptop",
            name = "HP Pavilion 15 Laptop",
            shortDescription = "i5 12th · 8GB · 512GB SSD",
            description = "HP Pavilion 15 with 12th gen Intel i5, 8GB RAM, fast 512GB SSD and a Full HD display. Great for work and study.",
            priceUgx = 2_650_000,
            oldPriceUgx = 3_050_000,
            category = ProductCategory.Electronics,
            brand = brandHp,
            seller = sellerTechHub,
            imageUrl = "laptop",
            rating = 4.4f,
            ratingCount = 67,
            isFlashDeal = true,
            discountPercent = 13,
            location = "Entebbe",
        ),
        Product(
            id = "p-nike-airmax",
            name = "Nike Air Max 270",
            shortDescription = "Men's · Black/White · Size 42",
            description = "Iconic Air Max 270 with full-length Air unit for all-day comfort. Premium leather and mesh upper.",
            priceUgx = 580_000,
            oldPriceUgx = 720_000,
            category = ProductCategory.Fashion,
            brand = brandNike,
            seller = sellerSneakerKing,
            imageUrl = "shoes",
            rating = 4.5f,
            ratingCount = 142,
            discountPercent = 19,
            location = "Kampala",
        ),
        Product(
            id = "p-adidas-ultraboost",
            name = "Adidas Ultraboost 22",
            shortDescription = "Running · Core Black · Size 41",
            description = "Adidas Ultraboost 22 with responsive Boost midsole and Primeknit upper. Built for serious runners.",
            priceUgx = 720_000,
            oldPriceUgx = 850_000,
            category = ProductCategory.Sports,
            brand = brandAdidas,
            seller = sellerSporting,
            imageUrl = "shoes",
            rating = 4.7f,
            ratingCount = 89,
            isFlashDeal = true,
            discountPercent = 15,
            location = "Jinja",
        ),
        Product(
            id = "p-newbalance-574",
            name = "New Balance 574 Core",
            shortDescription = "Grey · Unisex · Size 40",
            description = "The timeless New Balance 574 — versatile, comfortable and built to last.",
            priceUgx = 410_000,
            category = ProductCategory.Fashion,
            brand = brandNewBalance,
            seller = sellerSneakerKing,
            imageUrl = "shoes",
            rating = 4.3f,
            ratingCount = 54,
            location = "Kampala",
        ),
        Product(
            id = "p-basmati-rice",
            name = "Mukwano Basmati Rice 5kg",
            shortDescription = "Premium long-grain",
            description = "Long-grain aromatic basmati rice from Mukwano. Perfect for pilau, biryani and everyday meals.",
            priceUgx = 42_000,
            oldPriceUgx = 48_000,
            category = ProductCategory.Groceries,
            brand = brandMukwano,
            seller = sellerPearlFresh,
            imageUrl = "rice",
            rating = 4.5f,
            ratingCount = 312,
            isFlashDeal = true,
            discountPercent = 13,
            location = "Kampala",
        ),
        Product(
            id = "p-cooking-oil",
            name = "Mukwano Cooking Oil 3L",
            shortDescription = "Pure sunflower",
            description = "Premium refined sunflower oil — perfect for deep-frying and everyday cooking.",
            priceUgx = 38_000,
            category = ProductCategory.Groceries,
            brand = brandMukwano,
            seller = sellerPearlFresh,
            imageUrl = "oil",
            rating = 4.4f,
            ratingCount = 224,
            location = "Kampala",
        ),
        Product(
            id = "p-hisense-tv",
            name = "Hisense 55\" 4K Smart TV",
            shortDescription = "ULED · Android TV · HDR",
            description = "55-inch 4K ULED smart TV with Android TV, Dolby Vision HDR, built-in Chromecast and Bluetooth.",
            priceUgx = 1_980_000,
            oldPriceUgx = 2_300_000,
            category = ProductCategory.HomeLiving,
            brand = brandHisense,
            seller = sellerHomeAppliances,
            imageUrl = "tv",
            rating = 4.5f,
            ratingCount = 78,
            isFlashDeal = true,
            discountPercent = 14,
            location = "Kampala",
        ),
        Product(
            id = "p-vivo-y21",
            name = "Vivo Y21 (128GB)",
            shortDescription = "Midnight Blue · 5000mAh",
            description = "Vivo Y21 with 128GB storage, 5000mAh battery and a vibrant 6.5\" HD+ display. Reliable everyday performer.",
            priceUgx = 850_000,
            category = ProductCategory.Electronics,
            brand = brandVivo,
            seller = sellerTechHub,
            imageUrl = "phone",
            rating = 4.2f,
            ratingCount = 41,
            location = "Mbarara",
        ),
        Product(
            id = "p-lipstick",
            name = "Glamour Matte Lipstick",
            shortDescription = "Long-lasting · 12 shades",
            description = "Highly pigmented matte lipstick that stays put for 12+ hours. Available in 12 on-trend shades.",
            priceUgx = 28_000,
            oldPriceUgx = 35_000,
            category = ProductCategory.Beauty,
            brand = brandPearl,
            seller = sellerGlamour,
            imageUrl = "lipstick",
            rating = 4.4f,
            ratingCount = 156,
            isFlashDeal = true,
            discountPercent = 20,
            location = "Kampala",
        ),
        Product(
            id = "p-barsoap",
            name = "Pearl Bar Soap (Pack of 6)",
            shortDescription = "Family size · 200g each",
            description = "Mild family bar soap with a fresh fragrance. 6-pack value bundle for everyday use.",
            priceUgx = 18_000,
            category = ProductCategory.Beauty,
            brand = brandPearl,
            seller = sellerGlamour,
            imageUrl = "soap",
            rating = 4.3f,
            ratingCount = 88,
            location = "Kampala",
        ),
        Product(
            id = "p-smartwatch",
            name = "Safaricom Smart Watch X1",
            shortDescription = "Heart rate · GPS · 7-day battery",
            description = "Feature-rich smartwatch with continuous heart-rate monitoring, built-in GPS, sleep tracking and a 7-day battery.",
            priceUgx = 320_000,
            oldPriceUgx = 380_000,
            category = ProductCategory.Electronics,
            brand = brandSafaricom,
            seller = sellerTechHub,
            imageUrl = "watch",
            rating = 4.4f,
            ratingCount = 73,
            discountPercent = 16,
            location = "Kampala",
        ),
        Product(
            id = "p-anker-powerbank",
            name = "20,000mAh Power Bank",
            shortDescription = "Fast charge · Dual USB-C",
            description = "Slim 20,000mAh power bank with 22.5W fast charging and dual USB-C ports. Charges a phone 4-5 times.",
            priceUgx = 110_000,
            oldPriceUgx = 145_000,
            category = ProductCategory.Electronics,
            brand = brandHp,
            seller = sellerTechHub,
            imageUrl = "powerbank",
            rating = 4.6f,
            ratingCount = 117,
            isFlashDeal = true,
            discountPercent = 24,
            location = "Entebbe",
        ),
        Product(
            id = "p-headphones",
            name = "Wireless Headphones Pro",
            shortDescription = "ANC · 30h battery · Bluetooth 5.3",
            description = "Over-ear wireless headphones with active noise cancellation, 30-hour battery and Bluetooth 5.3.",
            priceUgx = 280_000,
            oldPriceUgx = 360_000,
            category = ProductCategory.Electronics,
            brand = brandSamsung,
            seller = sellerTechHub,
            imageUrl = "headphones",
            rating = 4.5f,
            ratingCount = 156,
            discountPercent = 22,
            location = "Kampala",
        ),
        Product(
            id = "p-basket",
            name = "Hand-woven Market Basket",
            shortDescription = "Natural fibres · 35cm",
            description = "Hand-woven by Ugandan artisans using sustainable local materials. Perfect for shopping or storage.",
            priceUgx = 65_000,
            category = ProductCategory.HomeLiving,
            brand = brandKampalaCrafts,
            seller = sellerUgandaCrafts,
            imageUrl = "basket",
            rating = 4.7f,
            ratingCount = 64,
            location = "Jinja",
        ),
        Product(
            id = "p-soybean-oil",
            name = "Fortified Soybean Oil 2L",
            shortDescription = "Vitamin A & D fortified",
            description = "Locally fortified cooking oil rich in Vitamin A and D. Affordable nutrition for everyday meals.",
            priceUgx = 24_000,
            category = ProductCategory.Groceries,
            brand = brandMukwano,
            seller = sellerPearlFresh,
            imageUrl = "oil",
            rating = 4.4f,
            ratingCount = 102,
            location = "Gulu",
        ),
        Product(
            id = "p-tire",
            name = "All-Season Tire 205/55 R16",
            shortDescription = "Tubeless · 50,000km warranty",
            description = "All-season tubeless tire with 50,000km warranty. Excellent wet and dry grip.",
            priceUgx = 380_000,
            oldPriceUgx = 450_000,
            category = ProductCategory.Automotive,
            brand = brandHp,
            seller = sellerAutoParts,
            imageUrl = "tire",
            rating = 4.3f,
            ratingCount = 41,
            discountPercent = 16,
            location = "Kampala",
        ),
    )

    val allProducts: List<Product> = products
    val flashDeals: List<Product> = products.filter { it.isFlashDeal }
    val recommended: List<Product> = products.filter { it.rating >= 4.4f }.take(10)

    fun productsByCategory(category: ProductCategory): List<Product> {
        if (category == ProductCategory.All) return products
        if (category == ProductCategory.More) return emptyList()
        return products.filter { it.category == category }
    }

    // ---------------------------------------------------------------
    // Hero banners — carousel content
    // ---------------------------------------------------------------
    val heroBanners: List<HeroBanner> = listOf(
        HeroBanner(
            id = "hero-1",
            title = "BIG DEALS",
            subtitle = "Amazing deals\njust for you!",
            supportingText = "Shop the best products\nfrom trusted sellers.",
            cta = "Shop Now",
            background = BannerBackground.BluePurple,
        ),
        HeroBanner(
            id = "hero-2",
            title = "FLASH SALE",
            subtitle = "Up to 24% off\nthis week",
            supportingText = "Limited time deals on\nphones, laptops and more.",
            cta = "Grab Now",
            background = BannerBackground.DarkNavy,
        ),
        HeroBanner(
            id = "hero-3",
            title = "LOCAL PICKS",
            subtitle = "Made in\nUganda",
            supportingText = "Support Ugandan makers\nand small businesses.",
            cta = "Shop Local",
            background = BannerBackground.GreenTeal,
        ),
    )

    // ---------------------------------------------------------------
    // Marketplace benefits (per brief: 4 cards)
    // ---------------------------------------------------------------
    val benefits: List<Benefit> = listOf(
        Benefit("FREE DELIVERY", "On orders over\nUGX 50,000", BenefitIcon.Delivery),
        Benefit("SECURE PAYMENTS", "100% safe &\nreliable", BenefitIcon.Security),
        Benefit("EASY RETURNS", "7-day return\npolicy", BenefitIcon.Returns),
        Benefit("BUYER PROTECTION", "Shop with\nconfidence", BenefitIcon.Protection),
    )

    // ---------------------------------------------------------------
    // Mock profile, cart, notifications
    // ---------------------------------------------------------------
    fun profileFor(displayName: String?, email: String?): BuyerProfile {
        val dn = displayName?.takeIf { it.isNotBlank() } ?: email?.substringBefore("@") ?: "ScottstechX User"
        return BuyerProfile(
            uid = "u-self",
            displayName = dn,
            email = email ?: "",
            avatarUrl = null,
            cartCount = 0,
            notificationCount = 3,
            wishlistCount = 0,
        )
    }

    val notifications: List<Notification> = listOf(
        Notification(
            id = "n-1",
            title = "Flash Deal just started!",
            body = "Up to 24% off electronics — ends in 02:45:30.",
            timestampLabel = "Just now",
            isUnread = true,
        ),
        Notification(
            id = "n-2",
            title = "Your order #2043 has shipped",
            body = "Track your delivery in real-time.",
            timestampLabel = "2h ago",
            isUnread = true,
        ),
        Notification(
            id = "n-3",
            title = "New seller near you",
            body = "Uganda Crafts is open in Jinja.",
            timestampLabel = "Yesterday",
            isUnread = true,
        ),
    )

    // ----- Sidebar badge counters -----
    // Stage 3.1 placeholder counts. Once the backend lands, swap these
    // for real Firestore queries (collections/users/{uid}/unreadCount).
    fun unreadMessagesCount(): Int = 2
    fun unreadNotificationsCount(): Int = notifications.count { it.isUnread }
    fun pendingOrdersCount(): Int = 3
}