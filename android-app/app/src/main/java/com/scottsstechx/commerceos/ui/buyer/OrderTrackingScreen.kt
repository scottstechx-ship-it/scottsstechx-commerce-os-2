package com.scottstechx.commerceos.ui.buyer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.scottstechx.commerceos.ui.theme.BrandPalette

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderTrackingScreen(
    orderId: String,
    onBack: () -> Unit,
    viewModel: OrderViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.loadOrderDetails(orderId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Track Order") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        val order = state.trackingOrder
        if (state.isLoading && order == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (order != null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Status: ${order.status.uppercase()}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = BrandPalette.BuyerPrimary)
                Spacer(Modifier.height(32.dp))

                TrackingStepper(currentStatus = order.status.lowercase())
                
                Spacer(Modifier.height(48.dp))
                
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Order Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        order.items.forEach { item ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Product ID: ${item.product_id.take(8)}", style = MaterialTheme.typography.bodySmall)
                                Text("x${item.qty}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                        HorizontalDivider(Modifier.padding(vertical = 8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total", fontWeight = FontWeight.Bold)
                            Text("${order.totalMinor} ${order.currency}", fontWeight = FontWeight.Bold, color = BrandPalette.BuyerPrimary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TrackingStepper(currentStatus: String) {
    val steps = listOf("created", "paid", "assigned", "picked_up", "delivered")
    val stepLabels = listOf("Order Placed", "Payment Confirmed", "Driver Assigned", "Picked Up", "Delivered")
    
    val currentIndex = steps.indexOf(currentStatus).let { if (it == -1) 0 else it }

    Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
        steps.forEachIndexed { index, step ->
            TrackingStepItem(
                label = stepLabels[index],
                isCompleted = index <= currentIndex,
                isLast = index == steps.size - 1
            )
        }
    }
}

@Composable
fun TrackingStepItem(label: String, isCompleted: Boolean, isLast: Boolean) {
    Row(verticalAlignment = Alignment.Top) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(if (isCompleted) BrandPalette.StatusSuccess else MaterialTheme.colorScheme.outlineVariant),
                contentAlignment = Alignment.Center
            ) {
                if (isCompleted) {
                    Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(40.dp)
                        .background(if (isCompleted) BrandPalette.StatusSuccess else MaterialTheme.colorScheme.outlineVariant)
                )
            }
        }
        Spacer(Modifier.width(16.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (isCompleted) FontWeight.Bold else FontWeight.Normal,
            color = if (isCompleted) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}
