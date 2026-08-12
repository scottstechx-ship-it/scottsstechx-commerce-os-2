package com.scottsx.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.scottsx.app.data.location.LocationProvider
import com.scottsx.app.data.remote.V2Client
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.components.ScottsTechXBottomBar
import com.scottsx.app.ui.theme.ScottsTechXColors
import kotlinx.coroutines.launch

/**
 * Stage-5 Nearby screen — wired to V2Client.nearbySellers().
 *
 * Data flow:
 *   1. Request location permission (or use a manual chip fallback).
 *   2. If GPS available, read the device's current lat/lng.
 *   3. Call GET /api/v1/sellers/v2/nearby?lat=…&lng=…&radiusKm=…
 *   4. Render the result list with distance, rating, and top 3 products.
 *
 * The previous in-memory `MarketplaceDataSource.allProducts` fallback is gone —
 * empty state is shown when the API returns no rows (or is offline).
 */
@Composable
fun NearbyScreen(
    onBack: () -> Unit,
    onOpenProduct: (com.scottsx.app.data.domain.Product) -> Unit = {},
    onTabSelect: (BottomTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var selectedLocation by remember {
        mutableStateOf<String?>(if (hasLocationPermission) "Kampala" else null)
    }
    var bottomTab by remember { mutableStateOf(BottomTab.Home) }
    var lat by remember { mutableStateOf<Double?>(null) }
    var lng by remember { mutableStateOf<Double?>(null) }
    var gpsStatus by remember { mutableStateOf("idle") } // "idle" | "requesting" | "ready" | "unavailable"
    val provider = remember { LocationProvider(context) }

    // API state
    var isLoading by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var nearbySellers by remember { mutableStateOf<List<V2Client.NearbySeller>>(emptyList()) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasLocationPermission = granted
        if (granted) selectedLocation = "Kampala"
    }

    // When permission is granted, attempt a real GPS fix on first composition.
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission && lat == null) {
            gpsStatus = "requesting"
            val loc = provider.currentLocation()
            if (loc != null) {
                lat = loc.latitude
                lng = loc.longitude
                gpsStatus = "ready"
            } else {
                gpsStatus = "unavailable"
            }
        }
    }

    // Fetch nearby sellers whenever we have a valid (lat,lng) pair.
    suspend fun fetchNearby() {
        val latitude = lat
        val longitude = lng
        if (latitude == null || longitude == null) return
        isLoading = true
        loadError = null
        try {
            val results = V2Client.nearbySellers(
                lat = latitude,
                lng = longitude,
                radiusKm = 25.0,
                limit = 40,
            )
            nearbySellers = results
            if (results.isEmpty()) {
                loadError = "No sellers found within 25 km. Try a different location."
            }
        } catch (t: Throwable) {
            loadError = "Network error: ${t.message ?: "unknown"}"
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(lat, lng) {
        if (lat != null && lng != null) fetchNearby()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScottsTechXColors.BackgroundLight),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 88.dp),
            contentPadding = PaddingValues(bottom = 16.dp),
        ) {
            // Header
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
                        .padding(top = 36.dp, bottom = 18.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.12f))
                                .clickable { onBack() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Nearby",
                                color = Color.White,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 22.sp,
                            )
                            Text(
                                text = when {
                                    gpsStatus == "ready" && lat != null && lng != null ->
                                        "GPS ready: ${"%.4f".format(lat)}, ${"%.4f".format(lng)}"
                                    gpsStatus == "requesting" -> "Locating you…"
                                    gpsStatus == "unavailable" -> "GPS unavailable — use the manual picker below"
                                    else -> "Find trending products and stores near you"
                                },
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 12.sp,
                            )
                        }
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.12f))
                                .clickable {
                                    scope.launch {
                                        isLoading = true
                                        loadError = null
                                        // Re-fetch the GPS fix
                                        if (hasLocationPermission) {
                                            val loc = provider.currentLocation()
                                            if (loc != null) {
                                                lat = loc.latitude
                                                lng = loc.longitude
                                                gpsStatus = "ready"
                                            }
                                        }
                                        fetchNearby()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = "Refresh",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }

            // Location summary / permission state
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    LocationStatusCard(
                        hasPermission = hasLocationPermission,
                        selectedLocation = selectedLocation,
                        onRequestPermission = {
                            permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                        },
                        onPickLocation = { loc -> selectedLocation = loc },
                    )
                }
            }

            // Result count + status
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Sellers near you",
                        color = ScottsTechXColors.OnLight,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 17.sp,
                    )
                    Spacer(Modifier.weight(1f))
                    when {
                        isLoading -> CircularProgressIndicator(
                            color = ScottsTechXColors.BluePrimary,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        else -> Text(
                            text = "${nearbySellers.size} results",
                            color = ScottsTechXColors.OnLightSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            // Error / empty state
            if (loadError != null && !isLoading) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFFFE5E5))
                            .padding(14.dp),
                    ) {
                        Text(
                            text = loadError ?: "",
                            color = Color(0xFF991B1B),
                            fontSize = 13.sp,
                        )
                    }
                }
            }

            // Sellers
            items(nearbySellers, key = { it.sellerId }) { seller ->
                NearbySellerRow(
                    seller = seller,
                    onClick = {
                        // Open first product if available, else ignore
                        val firstProduct = seller.products.firstOrNull()
                        if (firstProduct != null) {
                            val product = com.scottsx.app.data.domain.Product(
                                id = firstProduct.id,
                                name = firstProduct.title,
                                shortDescription = firstProduct.title,
                                description = firstProduct.title,
                                priceUgx = firstProduct.priceMinor / 100, // priceMinor is in minor units (cents); treat as UGX
                                category = com.scottsx.app.data.domain.ProductCategory.All,
                                brand = com.scottsx.app.data.domain.Brand(
                                    id = seller.sellerId,
                                    name = seller.storeName,
                                ),
                                seller = com.scottsx.app.data.domain.Seller(
                                    id = seller.sellerId,
                                    name = seller.storeName,
                                    rating = seller.rating.toFloat(),
                                    location = seller.city ?: "Uganda",
                                ),
                                imageUrl = firstProduct.image ?: "",
                                rating = firstProduct.rating.toFloat(),
                                location = seller.city ?: "Uganda",
                            )
                            onOpenProduct(product)
                        }
                    },
                )
            }
        }

        // Floating bottom nav
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
private fun NearbySellerRow(
    seller: V2Client.NearbySeller,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            ScottsTechXColors.BluePrimary,
                            ScottsTechXColors.BluePrimaryLight,
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Store,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(26.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = seller.storeName,
                color = ScottsTechXColors.OnLight,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
            Text(
                text = buildString {
                    append(seller.city ?: "Uganda")
                    if (seller.products.isNotEmpty()) {
                        append(" · ")
                        append(seller.products.first().title)
                    }
                },
                color = ScottsTechXColors.OnLightSecondary,
                fontSize = 12.sp,
                maxLines = 1,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = null,
                    tint = Color(0xFFFBBF24),
                    modifier = Modifier.size(13.dp),
                )
                Spacer(Modifier.width(2.dp))
                Text(
                    text = "%.1f".format(seller.rating),
                    color = ScottsTechXColors.OnLightSecondary,
                    fontSize = 11.sp,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (seller.distanceKm < Double.MAX_VALUE) "%.1f km away".format(seller.distanceKm) else "— km",
                    color = ScottsTechXColors.BluePrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

@Composable
private fun LocationStatusCard(
    hasPermission: Boolean,
    selectedLocation: String?,
    onRequestPermission: () -> Unit,
    onPickLocation: (String) -> Unit,
) {
    val ugandaLocations = listOf(
        "Kampala", "Entebbe", "Jinja", "Mbarara", "Gulu", "Mbale",
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        ScottsTechXColors.BluePrimary,
                        ScottsTechXColors.BluePrimaryDark,
                    ),
                ),
            )
            .padding(16.dp),
    ) {
        Column {
            if (hasPermission) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.LocationOn,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Using your location",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                        Text(
                            text = selectedLocation ?: "Detecting...",
                            color = Color.White.copy(alpha = 0.85f),
                            fontSize = 12.sp,
                        )
                    }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.NearMe,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Allow location access?",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                        Text(
                            text = "Use your GPS to find products and stores near you.",
                            color = Color.White.copy(alpha = 0.85f),
                            fontSize = 12.sp,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .clickable { onRequestPermission() }
                        .padding(vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.NearMe,
                        contentDescription = null,
                        tint = ScottsTechXColors.BluePrimary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Use my location",
                        color = ScottsTechXColors.BluePrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                text = "Or pick a location manually:",
                color = Color.White.copy(alpha = 0.85f),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ugandaLocations.take(3).forEach { loc ->
                    LocationChip(
                        label = loc,
                        selected = selectedLocation == loc,
                        onClick = { onPickLocation(loc) },
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ugandaLocations.drop(3).forEach { loc ->
                    LocationChip(
                        label = loc,
                        selected = selectedLocation == loc,
                        onClick = { onPickLocation(loc) },
                    )
                }
            }
        }
    }
}

@Composable
private fun LocationChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (selected) Color.White else Color.White.copy(alpha = 0.18f),
            )
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            color = if (selected) ScottsTechXColors.BluePrimary else Color.White,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            fontSize = 12.sp,
        )
    }
}
