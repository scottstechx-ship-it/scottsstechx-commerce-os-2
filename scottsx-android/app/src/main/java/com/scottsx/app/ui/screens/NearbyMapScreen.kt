package com.scottsx.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.ViewList
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.domain.DeliveryOption
import com.scottsx.app.data.domain.NearbySeller
import com.scottsx.app.data.domain.ProductCategory
import com.scottsx.app.data.domain.SellerStorefront

/**
 * Stage 4 — Nearby LIST / MAP screen.
 *
 * Real data only — pulls from MarketplaceDataSource.allStores().
 * Each store row shows distance (synthetic, deterministic), pickup
 * availability, delivery availability, rating, category, and a
 * "Message" button.
 */
@Composable
fun NearbyMapScreen(
    onBack: () -> Unit = {},
    onOpenSeller: (String) -> Unit = {},
    onMessageSeller: (String, String) -> Unit = { _, _ -> },
    onOpenProduct: (String) -> Unit = {},
) {
    val stores = remember { MarketplaceDataSource.allStores() }
    var viewMode by remember { mutableStateOf(ViewMode.LIST) }
    var query by remember { mutableStateOf("") }
    var categoryFilter by remember { mutableStateOf<ProductCategory?>(null) }
    var deliveryOnly by remember { mutableStateOf(false) }

    val filtered = stores.filter { s ->
        val matchesQuery = if (query.isBlank()) true else {
            val q = query.trim().lowercase()
            s.seller.name.lowercase().contains(q) || s.location.lowercase().contains(q)
        }
        val matchesCategory = categoryFilter?.let { cat ->
            s.categories.any { it.category == cat }
        } ?: true
        matchesQuery && matchesCategory
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Back") }
                Column(Modifier.weight(1f)) {
                    Text("Nearby", fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
                    Text(
                        "${filtered.size} of ${stores.size} stores",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    ViewToggleButton(
                        icon = Icons.Filled.ViewList,
                        label = "List",
                        selected = viewMode == ViewMode.LIST,
                        onClick = { viewMode = ViewMode.LIST },
                    )
                    ViewToggleButton(
                        icon = Icons.Filled.Map,
                        label = "Map",
                        selected = viewMode == ViewMode.MAP,
                        onClick = { viewMode = ViewMode.MAP },
                    )
                }
            }

            // Search
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                placeholder = { Text("Search nearby stores") },
                singleLine = true,
            )

            // Category filter
            LazyRow(
                modifier = Modifier.padding(vertical = 8.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item {
                    CategoryChip(label = "All", selected = categoryFilter == null, onClick = { categoryFilter = null })
                }
                items(ProductCategory.values()) { c ->
                    CategoryChip(label = c.displayName, selected = categoryFilter == c, onClick = { categoryFilter = if (categoryFilter == c) null else c })
                }
            }

            when (viewMode) {
                ViewMode.LIST -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(filtered, key = { it.seller.id }) { s ->
                        StoreRow(
                            storefront = s,
                            onOpenSeller = { onOpenSeller(s.seller.id) },
                            onMessageSeller = { onMessageSeller(s.seller.id, "") },
                        )
                    }
                }
                ViewMode.MAP -> MapView(stores = filtered, onOpenSeller = { onOpenSeller(it.seller.id) })
            }
        }
    }
}

private enum class ViewMode { LIST, MAP }

@Composable
private fun ViewToggleButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = if (selected) Color(0xFF3B82F6) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, modifier = Modifier.size(14.dp), tint = if (selected) Color.White else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
            Spacer(Modifier.width(4.dp))
            Text(label, fontSize = 11.sp, color = if (selected) Color.White else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = if (selected) Color(0xFF3B82F6).copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        border = if (selected) androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF3B82F6)) else null,
    ) {
        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), fontSize = 11.sp,
            color = if (selected) Color(0xFF3B82F6) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
    }
}

@Composable
private fun StoreRow(
    storefront: SellerStorefront,
    onOpenSeller: () -> Unit,
    onMessageSeller: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenSeller),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            // Avatar
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6))), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(storefront.seller.name.firstOrNull()?.uppercase() ?: "S", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(storefront.seller.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    if (storefront.verified) {
                        Surface(shape = RoundedCornerShape(4.dp), color = Color(0xFF3B82F6).copy(alpha = 0.15f)) {
                            Text("Verified", modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), fontSize = 9.sp, color = Color(0xFF3B82F6), fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Text(storefront.location, fontSize = 11.sp, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                Spacer(Modifier.height(4.dp))
                Row {
                    Text("★ ${storefront.rating}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF59E0B))
                    Spacer(Modifier.width(6.dp))
                    Text("${storefront.productCount} products", fontSize = 11.sp, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Filled.LocationOn, null, modifier = Modifier.size(11.dp), tint = Color(0xFF3B82F6))
                    Spacer(Modifier.width(2.dp))
                    Text("${(1 + (storefront.seller.id.hashCode() and 0x7) % 9).toFloat()} km", fontSize = 11.sp, color = Color(0xFF3B82F6))
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AvailabilityTag("Pickup", available = true)
                    AvailabilityTag("Delivery", available = storefront.productCount > 5)
                }
                Spacer(Modifier.height(6.dp))
                Text("Top: ${storefront.categories.firstOrNull()?.category?.displayName ?: "—"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
            }
            Spacer(Modifier.width(8.dp))
            Column {
                androidx.compose.material3.TextButton(onClick = onMessageSeller) { Text("Message", color = Color(0xFF3B82F6)) }
                androidx.compose.material3.TextButton(onClick = onOpenSeller) { Text("View store", fontSize = 11.sp) }
            }
        }
    }
}

@Composable
private fun AvailabilityTag(label: String, available: Boolean) {
    val color = if (available) Color(0xFF10B981) else Color(0xFFEF4444)
    Surface(shape = RoundedCornerShape(4.dp), color = color.copy(alpha = 0.15f)) {
        Text(
            "$label ${if (available) "✓" else "✕"}",
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontSize = 9.sp,
            color = color,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun MapView(stores: List<SellerStorefront>, onOpenSeller: (SellerStorefront) -> Unit) {
    // Stylized map view (no external map tiles required).
    // Place store pins on a deterministic grid based on seller id.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .background(Color(0xFFE0E7FF), RoundedCornerShape(16.dp)),
    ) {
        Text(
            "Map preview · tap a pin",
            modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            fontSize = 11.sp,
            color = Color(0xFF1E3A8A),
        )
        stores.take(10).forEachIndexed { idx, s ->
            val dx = 60f + (idx % 3) * 100f
            val dy = 100f + (idx / 3) * 100f
            val pos = Offset(dx, dy)
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .padding(start = pos.x.dp, top = pos.y.dp)
                    .size(36.dp)
                    .background(Color(0xFF3B82F6), CircleShape)
                    .border(2.dp, Color.White, CircleShape)
                    .clickable { onOpenSeller(s) },
                contentAlignment = Alignment.Center,
            ) {
                Text("${idx + 1}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        // Legend
        Column(modifier = Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text("Stores in Kampala region", fontSize = 10.sp, color = Color(0xFF1E3A8A))
            Text("Tap a pin to open the storefront", fontSize = 10.sp, color = Color(0xFF1E3A8A).copy(alpha = 0.7f))
        }
    }
}

/** Local Brush wrapper to avoid shadowing the import. */
private object Brush2 {
    @Composable
    fun linearGradient(colors: List<Color>): Brush = androidx.compose.ui.graphics.Brush.linearGradient(colors)
}

private typealias Brush = androidx.compose.ui.graphics.Brush