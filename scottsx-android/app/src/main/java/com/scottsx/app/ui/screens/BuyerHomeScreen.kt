package com.scottsx.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.data.CartStore
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.domain.ProductCategory
import com.scottsx.app.data.domain.BuyerProfile
import com.scottsx.app.ui.components.BenefitsStrip
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.components.BuyerHeader
import com.scottsx.app.ui.components.CountdownTimer
import com.scottsx.app.ui.components.HeroCarousel
import com.scottsx.app.ui.components.CategoryRow
import com.scottsx.app.ui.components.NearbyAiCard
import com.scottsx.app.ui.components.ProductCard
import com.scottsx.app.ui.components.ScottsTechXBottomBar
import com.scottsx.app.ui.components.SectionTitle
import com.scottsx.app.ui.theme.ScottsTechXColors

/**
 * Stage-2 Buyer Home Dashboard.
 *
 * Vertical hierarchy (per brief):
 *   1. Header
 *   2. Search + filter
 *   3. Hero carousel
 *   4. Category row
 *   5. Marketplace benefits
 *   6. Nearby + AI Assistant
 *   7. Flash Deals (countdown + horizontal scroll)
 *   8. Recommended for you
 *   9. Floating transparent blue animated bottom nav
 */
@Composable
fun BuyerHomeScreen(
    profile: BuyerProfile,
    onNavigateToCart: () -> Unit,
    onNavigateToCategory: (ProductCategory) -> Unit,
    onNavigateToSearch: () -> Unit,
    onNavigateToNearby: () -> Unit,
    onNavigateToAi: () -> Unit,
    onNavigateToAllProducts: () -> Unit,
    onTabSelect: (BottomTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cartItems by CartStore.items.collectAsState()
    val cartCount = cartItems.sumOf { it.quantity }

    var selectedCategory by remember { mutableStateOf(ProductCategory.All) }
    var bottomTab by remember { mutableStateOf(BottomTab.Home) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScottsTechXColors.BackgroundLight),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 88.dp),  // leave room for floating nav
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp),
        ) {
            // 1. Header
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    ScottsTechXColors.BluePrimaryDark,
                                    ScottsTechXColors.BluePrimary,
                                ),
                            ),
                        )
                        .padding(top = 32.dp, bottom = 18.dp),
                ) {
                    BuyerHeader(
                        displayName = profile.displayName,
                        email = profile.email,
                        notificationCount = profile.notificationCount,
                        cartCount = cartCount,
                        onNotificationsClick = { /* Stage 2 — notifications */ },
                        onCartClick = onNavigateToCart,
                    )
                }
            }

            // 2. Search bar + filter
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    BuyerSearchBar(
                        modifier = Modifier.weight(1f),
                        onClick = onNavigateToSearch,
                    )
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(ScottsTechXColors.BluePrimary, ScottsTechXColors.BluePrimaryLight),
                                ),
                            )
                            .clickable { onNavigateToSearch() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.FilterList,
                            contentDescription = "Filters",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }

            // 3. Hero carousel
            item {
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    HeroCarousel(
                        banners = MarketplaceDataSource.heroBanners,
                        onCtaClick = { onNavigateToAllProducts() },
                    )
                }
            }

            // 4. Category row
            item {
                Spacer(Modifier.height(18.dp))
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    CategoryRow(
                        selected = selectedCategory,
                        onSelect = { cat ->
                            selectedCategory = cat
                            onNavigateToCategory(cat)
                        },
                    )
                }
            }

            // 5. Marketplace benefits
            item {
                Spacer(Modifier.height(20.dp))
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    BenefitsStrip(benefits = MarketplaceDataSource.benefits)
                }
            }

            // 6. Nearby + AI Assistant
            item {
                Spacer(Modifier.height(20.dp))
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    NearbyAiCard(
                        onNearbyClick = onNavigateToNearby,
                        onAiClick = onNavigateToAi,
                    )
                }
            }

            // 7. Flash Deals
            item {
                Spacer(Modifier.height(22.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    SectionTitle(
                        title = "Flash Deals",
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.FilterList,  // placeholder, swapped below
                                contentDescription = null,
                                tint = ScottsTechXColors.BluePrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        },
                        viewAll = "View All >",
                        onViewAll = onNavigateToAllProducts,
                    )
                    CountdownTimer(initialSeconds = 2 * 3600 + 45 * 60 + 30)
                }
            }
            item {
                Spacer(Modifier.height(8.dp))
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(MarketplaceDataSource.flashDeals, key = { it.id }) { product ->
                        ProductCard(
                            product = product,
                            onClick = { /* Stage 2 — product details */ },
                            onAddToCart = { CartStore.add(product.id) },
                        )
                    }
                }
            }

            // 8. Recommended for you
            item {
                Spacer(Modifier.height(22.dp))
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    SectionTitle(
                        title = "Recommended for you",
                        viewAll = "View All >",
                        onViewAll = onNavigateToAllProducts,
                    )
                }
            }
            item {
                Spacer(Modifier.height(8.dp))
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(MarketplaceDataSource.recommended, key = { it.id }) { product ->
                        ProductCard(
                            product = product,
                            onClick = { /* Stage 2 — product details */ },
                            onAddToCart = { CartStore.add(product.id) },
                        )
                    }
                }
            }

            // bottom padding helper
            item {
                Spacer(Modifier.height(8.dp))
            }
        }

        // 9. Floating bottom nav
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
        ) {
            ScottsTechXBottomBar(
                selected = bottomTab,
                onSelect = { tab ->
                    bottomTab = tab
                    onTabSelect(tab)
                },
            )
        }
    }
}

@Composable
private fun BuyerSearchBar(
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .clickable { onClick() },
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = "Search",
                tint = ScottsTechXColors.OnLightSecondary,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = "Search for products, brands and categories...",
                color = ScottsTechXColors.OnLightSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}
