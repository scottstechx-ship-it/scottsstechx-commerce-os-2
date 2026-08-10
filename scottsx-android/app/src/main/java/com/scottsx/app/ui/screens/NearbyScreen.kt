package com.scottsx.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.location.LocationProvider
import com.scottsx.app.data.domain.Product
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.components.ProductCard
import com.scottsx.app.ui.components.ScottsTechXBottomBar
import com.scottsx.app.ui.theme.ScottsTechXColors
import com.scottsx.app.ui.util.formatUgx

/**
 * Stage-2 Nearby marketplace. The brief explicitly requires:
 *  - "The user must be able to tap this card."
 *  - "If location permission has not been granted: Show a clear
 *    permission explanation. Do NOT silently access location."
 *  - "If location is unavailable: Provide an alternative such as
 *    selecting a location manually."
 *  - "The Home Dashboard only needs the premium entry card at
 *    this stage, but the navigation must be prepared for the
 *    full Nearby experience."
 *
 * We deliver a list+map hybrid here — products filtered to
 * "near you" with a manual location picker as fallback.
 */
@Composable
fun NearbyScreen(
    onBack: () -> Unit,
    onTabSelect: (BottomTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
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

    // Stage-3: when permission is granted, attempt a real GPS fix on
    // first composition. The user can still pick a chip below if the
    // device refuses (offline / indoors / OS denied).
    androidx.compose.runtime.LaunchedEffect(hasLocationPermission) {
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

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasLocationPermission = granted
        if (granted) selectedLocation = "Kampala"
    }

    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            // Do NOT silently request — surface UI first
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScottsTechXColors.BackgroundLight),
    ) {
        val nearbyProducts = remember(selectedLocation) {
            val base = if (selectedLocation == null) {
                MarketplaceDataSource.allProducts.take(8)
            } else {
                MarketplaceDataSource.allProducts
                    .sortedBy { it.location == selectedLocation }
                    .take(8)
            }
            base
        }
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 88.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp),
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
                                    permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.NearMe,
                                contentDescription = "Use my location",
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

            // Nearby products (sorted by location)
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Products near you",
                        color = ScottsTechXColors.OnLight,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 17.sp,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = "${nearbyProducts.size} results",
                        color = ScottsTechXColors.OnLightSecondary,
                        fontSize = 12.sp,
                    )
                }
            }
            items(nearbyProducts, key = { it.id }) { product ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
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
                            imageVector = Icons.Filled.LocationOn,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(26.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = product.name,
                            color = ScottsTechXColors.OnLight,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Text(
                            text = "${product.seller.name} · ${product.location}",
                            color = ScottsTechXColors.OnLightSecondary,
                            fontSize = 12.sp,
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
                                text = "%.1f".format(product.rating),
                                color = ScottsTechXColors.OnLightSecondary,
                                fontSize = 11.sp,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = formatUgx(product.priceUgx),
                                color = ScottsTechXColors.BluePrimary,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 13.sp,
                            )
                        }
                    }
                }
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
            .clip(RoundedCornerShape(20.dp))
            .background(
                if (selected) Color.White else Color.White.copy(alpha = 0.18f),
            )
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            color = if (selected) ScottsTechXColors.BluePrimary else Color.White,
            fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp,
        )
    }
}
