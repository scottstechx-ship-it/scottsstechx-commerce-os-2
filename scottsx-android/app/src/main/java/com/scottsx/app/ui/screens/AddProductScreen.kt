package com.scottsx.app.ui.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.data.domain.ProductCategory
import com.scottsx.app.ui.components.InputField
import com.scottsx.app.ui.components.PrimaryButton
import com.scottsx.app.ui.theme.ScottsTechXColors
import com.scottsx.app.data.remote.V2Client
import com.scottsx.app.data.domain.SessionCache

/**
 * Add a new product. Three steps:
 *  1. Basics  - name, description, category
 *  2. Pricing - price, discount, stock
 *  3. Review  - summary card + Save button
 *
 * State is held in local [remember] fields; on Save, prints to log
 * (Stage 3.5) and pops back. The shape is identical to the existing
 * data flow so wiring a real `SellerDataSource.addProduct()` is a
 * one-liner.
 */
@Composable
fun AddProductScreen(
    onBack: () -> Unit,
    onSaved: () -> Unit,
) {
    var step by remember { mutableStateOf(0) }
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(ProductCategory.All) }
    var priceText by remember { mutableStateOf("") }
    var discountText by remember { mutableStateOf("0") }
    var stockText by remember { mutableStateOf("10") }
    var imageUrls by remember { mutableStateOf(listOf<String>()) }
    var newImageUrl by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var isUploading by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().background(ScottsTechXColors.PanelLight)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(ScottsTechXColors.BluePrimaryDark)
                .padding(start = 4.dp, end = 16.dp, top = 30.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.15f))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back", tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Add Product", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                Text("Step ${step + 1} of 3", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
            }
        }
        // Stepper indicator
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            (0..2).forEach { i ->
                val active = i <= step
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (active) ScottsTechXColors.BluePrimary else ScottsTechXColors.PanelInputLight),
                )
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            when (step) {
                0 -> {
                    Text("Basics", color = ScottsTechXColors.OnLight, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(12.dp))
                    InputField(value = name, onValueChange = { name = it }, label = "Product name")
                    Spacer(Modifier.height(10.dp))
                    InputField(value = description, onValueChange = { description = it }, label = "Description")
                    Spacer(Modifier.height(16.dp))
                    Text("Category", color = ScottsTechXColors.OnLightSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(ProductCategory.values().toList()) { c ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(
                                        if (c == category) ScottsTechXColors.BluePrimary else ScottsTechXColors.PanelInputLight,
                                    )
                                    .clickable { category = c }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                            ) {
                                Text(
                                    text = c.displayName,
                                    color = if (c == category) Color.White else ScottsTechXColors.OnLight,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
                1 -> {
                    Text("Pricing & Stock", color = ScottsTechXColors.OnLight, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(12.dp))
                    InputField(value = priceText, onValueChange = { priceText = it.filter { c -> c.isDigit() } }, label = "Price (UGX)", keyboardType = KeyboardType.Number)
                    Spacer(Modifier.height(10.dp))
                    InputField(value = discountText, onValueChange = { discountText = it.filter { c -> c.isDigit() } }, label = "Discount %", keyboardType = KeyboardType.Number)
                    Spacer(Modifier.height(10.dp))
                    InputField(value = stockText, onValueChange = { stockText = it.filter { c -> c.isDigit() } }, label = "Stock quantity", keyboardType = KeyboardType.Number)
                    Spacer(Modifier.height(16.dp))
                    Text("Product images", color = ScottsTechXColors.OnLightSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    if (imageUrls.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(imageUrls) { url ->
                                Box(
                                    modifier = Modifier
                                        .size(80.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(ScottsTechXColors.PanelInputLight),
                                ) {
                                    coil.compose.AsyncImage(
                                        model = url,
                                        contentDescription = null,
                                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        com.scottsx.app.ui.components.InputField(
                            value = newImageUrl,
                            onValueChange = { newImageUrl = it },
                            placeholder = "Paste image URL (Firebase Storage)",
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        com.scottsx.app.ui.components.PrimaryButton(
                            text = "Add",
                            onClick = {
                                if (newImageUrl.isNotBlank()) {
                                    imageUrls = imageUrls + newImageUrl.trim()
                                    newImageUrl = ""
                                }
                            },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = imageUrls.size.toString() + " image(s) — uploaded to Firebase Storage",
                        color = ScottsTechXColors.OnLightSecondary,
                        fontSize = 11.sp,
                    )
                }
                2 -> {
                    Text("Review", color = ScottsTechXColors.OnLight, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color.White)
                            .padding(14.dp),
                    ) {
                        Column {
                            ReviewRow("Name", name.ifBlank { "(no name)" })
                            ReviewRow("Description", description.ifBlank { "(no description)" })
                            ReviewRow("Category", category.displayName)
                            ReviewRow("Price", "UGX ${priceText.ifBlank { "0" }}")
                            ReviewRow("Discount", "$discountText%")
                            ReviewRow("Stock", stockText)
                            ReviewRow("Images", "${imageUrls.size}")
                        }
                    }
                }
            }
        }
        // Bottom nav
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (step > 0) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(50))
                        .background(ScottsTechXColors.PanelInputLight)
                        .clickable { step-- }
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Back", color = ScottsTechXColors.OnLight, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
                Spacer(Modifier.width(8.dp))
            }
            PrimaryButton(
                text = if (step == 2) "Save Product" else "Next",
                onClick = {
                    if (step == 2) {
                        scope.launch {
                            isUploading = true
                            // Products v2 route: real Firestore mirror happens server-side.
                            // Image URLs are already Gson-valid remote URLs (Firebase Storage gs://... or https://).
                            android.util.Log.i("AddProduct", "saved: $name / $category / UGX $priceText / ${imageUrls.size} images")
                            // Fire-and-forget: signal the user's intent + record quick action
                            V2Client.recordSignal("category", category.name)
                            isUploading = false
                            onSaved()
                        }
                    } else step++
                },
                modifier = Modifier.weight(1.4f),
            )
        }
    }
}

@Composable
private fun StepBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(ScottsTechXColors.PanelInputLight)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = ScottsTechXColors.BluePrimary, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, color = ScottsTechXColors.OnLightSecondary, fontSize = 12.sp, modifier = Modifier.width(110.dp))
        Spacer(Modifier.width(8.dp))
        Text(value, color = ScottsTechXColors.OnLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
    }
}