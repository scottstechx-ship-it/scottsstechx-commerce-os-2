package com.scottsx.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.domain.Product
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.components.ProductCard
import com.scottsx.app.ui.components.ScottsTechXBottomBar
import com.scottsx.app.ui.components.SectionTitle
import com.scottsx.app.ui.theme.ScottsTechXColors

/**
 * Seller home — counterpart to BuyerHomeScreen.
 *
 * Same shell: gradient header with avatar + greeting + bell, scrollable
 * body, and the floating ScottsTechXBottomBar pinned at the bottom.
 *
 * Body shows:
 *  1. Three KPI tiles (active listings, orders this week, monthly revenue).
 *  2. Quick-action chips (Add product, Manage orders, Inventory).
 *  3. "My active listings" carousel — reuses ProductCard from the buyer
 *     side so the seller can preview what buyers see.
 *
 * The `BottomTab` layout mirrors the buyer dashboard (Home, Nearby, AI,
 * Wishlist, Profile) but the Wishlist tile is repurposed as "Orders"
 * inside the seller Home screen — the bottom-bar reuses BuyerWishlist
 * for now since it's just navigation plumbing; the Wishlist screen is
 * noble enough to render for sellers too (their saved buyers list).
 *
 * Roles separate: this route is gated by `Routes.SELLER_HOME` and a
 * mismatch (a Buyer email hitting this route) shows a toast and bounces
 * back to the role picker — see AppNavigation for the gate.
 */
@Composable
fun SellerHomeScreen(
    displayName: String,
    email: String,
    onAddProduct: () -> Unit = {},
    onManageOrders: () -> Unit = {},
    onOpenInventory: () -> Unit = {},
    onOpenProduct: (Product) -> Unit = {},
    onTabSelect: (BottomTab) -> Unit,
    onSignOut: () -> Unit,
) {
    var bottomTab by remember { mutableStateOf(BottomTab.Home) }
    // Local sample data — Stage 3 placeholder until backend seller stats.
    val kpis = remember { sellerKpis() }

    Box(modifier = Modifier.fillMaxSize().background(ScottsTechXColors.PanelLight)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(bottom = 88.dp),
        ) {
            item { SellerHeader(displayName, email) }
            item { Spacer(Modifier.height(20.dp)) }
            item {
                SellerKpiRow(
                    kpis = kpis,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
            item { Spacer(Modifier.height(20.dp)) }
            item {
                QuickActionsRow(
                    onAddProduct = onAddProduct,
                    onManageOrders = onManageOrders,
                    onOpenInventory = onOpenInventory,
                )
            }
            item { Spacer(Modifier.height(20.dp)) }
            item {
                SectionTitle(
                    title = "My active listings",
                    viewAll = "See all",
                    onViewAll = {},
                )
            }
            item {
                LazyRow(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = 16.dp, vertical = 8.dp,
                    ),
                ) {
                    items(MarketplaceDataSource.allProducts.take(8), key = { it.id }) { p ->
                        ProductCard(
                            product = p,
                            width = 168.dp,
                            onClick = { onOpenProduct(p) },
                            onAddToCart = { /* Stage 3: edit listing */ },
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(20.dp)) }
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(ScottsTechXColors.PanelInputLight)
                        .clickable { onSignOut() }
                        .padding(14.dp),
                ) {
                    Text(
                        text = "Sign out",
                        color = Color(0xFFDC2626),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
            }
        }

        Box(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
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
private fun SellerHeader(displayName: String, email: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        ScottsTechXColors.BluePrimaryDark,
                        ScottsTechXColors.BluePrimary,
                    ),
                ),
            )
            .padding(top = 36.dp, start = 16.dp, end = 16.dp, bottom = 24.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = displayName.firstOrNull()?.uppercase() ?: "S",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Seller Hub",
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 12.sp,
                    )
                    Text(
                        text = displayName,
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = email,
                color = Color.White.copy(alpha = 0.85f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun SellerKpiRow(
    kpis: List<SellerKpi>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        kpis.forEach { k -> KpiTile(k, modifier = Modifier.weight(1f)) }
    }
}

@Composable
private fun KpiTile(k: SellerKpi, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(k.tint.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = k.icon,
                contentDescription = null,
                tint = k.tint,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = k.label,
            color = ScottsTechXColors.OnLightSecondary,
            fontSize = 11.sp,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = k.value,
            color = ScottsTechXColors.OnLight,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 18.sp,
        )
    }
}

@Composable
private fun QuickActionsRow(
    onAddProduct: () -> Unit,
    onManageOrders: () -> Unit,
    onOpenInventory: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        QuickActionChip("Add product", Icons.Filled.Add, onAddProduct)
        QuickActionChip("Manage orders", Icons.Filled.LocalShipping, onManageOrders)
        QuickActionChip("Inventory", Icons.Filled.Inventory2, onOpenInventory)
    }
}

@Composable
private fun QuickActionChip(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(ScottsTechXColors.BluePrimary)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

/** Sample KPI shape — populated from Stage-3 seller stats endpoint in v3.1. */
private data class SellerKpi(
    val label: String,
    val value: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val tint: Color,
)

private fun sellerKpis(): List<SellerKpi> = listOf(
    SellerKpi("Active listings", "12", Icons.Filled.Inventory2, ScottsTechXColors.BluePrimary),
    SellerKpi("Orders this week", "27", Icons.Filled.LocalShipping, Color(0xFF059669)),
    SellerKpi("This month", "UGX 1.8M", Icons.Filled.TrendingUp, Color(0xFFEA580C)),
)
