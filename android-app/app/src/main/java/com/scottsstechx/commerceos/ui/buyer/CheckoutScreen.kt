package com.scottstechx.commerceos.ui.buyer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.PhoneAndroid
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
import com.scottstechx.commerceos.ui.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onBack: () -> Unit,
    onOrderSuccess: (String) -> Unit,
    viewModel: BuyerViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    var address by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("Kampala") }
    var paymentMethod by remember { mutableStateOf("momo") }
    var phone by remember { mutableStateOf("") }

    LaunchedEffect(state.lastOrder) {
        state.lastOrder?.let {
            onOrderSuccess(it.orderId)
            viewModel.dismissOrder()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Checkout", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.Md)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Spacing.Lg)
        ) {
            // Summary Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(Modifier.padding(Spacing.Md)) {
                    Text("Order Summary", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Spacing.Sm))
                    state.cart.forEach { line ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${line.product.title} x ${line.qty}", style = MaterialTheme.typography.bodyMedium)
                            Text("${line.lineTotalMinor} ${line.product.currency}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                    HorizontalDivider(Modifier.padding(vertical = Spacing.Sm))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total Amount", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("${state.cartTotalMinor} UGX", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = BrandPalette.BuyerPrimary)
                    }
                }
            }

            // Delivery Details
            Text("Delivery Address", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Street Address / Zone") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )
            OutlinedTextField(
                value = city,
                onValueChange = { city = it },
                label = { Text("City") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            // Payment Method
            Text("Payment Method", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.Md)) {
                PaymentMethodCard(
                    label = "MoMo",
                    icon = Icons.Default.PhoneAndroid,
                    isSelected = paymentMethod == "momo",
                    onClick = { paymentMethod = "momo" },
                    modifier = Modifier.weight(1f)
                )
                PaymentMethodCard(
                    label = "Card",
                    icon = Icons.Default.CreditCard,
                    isSelected = paymentMethod == "card",
                    onClick = { paymentMethod = "card" },
                    modifier = Modifier.weight(1f)
                )
            }

            if (paymentMethod == "momo") {
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("MoMo Phone Number") },
                    placeholder = { Text("e.g. 256770000000") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )
            }

            Spacer(Modifier.height(Spacing.Lg))

            Button(
                onClick = { 
                    // Update: checkout now needs to handle payment details
                    // I'll update BuyerViewModel.checkout to accept these
                    viewModel.checkout(address, city) 
                },
                modifier = Modifier.fillMaxWidth().height(60.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandPalette.BuyerPrimary),
                enabled = !state.isCheckingOut && address.isNotBlank()
            ) {
                if (state.isCheckingOut) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text("Place Order & Pay", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
            
            if (state.checkoutError != null) {
                Text(state.checkoutError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun PaymentMethodCard(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, isSelected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(2.dp, if (isSelected) BrandPalette.BuyerPrimary else MaterialTheme.colorScheme.outlineVariant),
        color = if (isSelected) BrandPalette.BuyerPrimary.copy(alpha = 0.05f) else Color.Transparent,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Md),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, null, tint = if (isSelected) BrandPalette.BuyerPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(Spacing.Sm))
            Text(label, fontWeight = FontWeight.Bold, color = if (isSelected) BrandPalette.BuyerPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
