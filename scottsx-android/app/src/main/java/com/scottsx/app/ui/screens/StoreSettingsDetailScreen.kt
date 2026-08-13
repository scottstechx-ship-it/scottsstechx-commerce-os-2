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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.ui.theme.ScottsTechXColors

/**
 * Single store-settings detail screen. Renders a form specific to the
 * [section] passed in. Sections handled:
 *
 *   - "store-profile"   : Store name + description + logo placeholder
 *   - "business-info"   : Verified business name + tax ID + ID upload
 *   - "store-location"  : Address + pickup point + radius
 *   - "delivery"        : Delivery radius + fee + free-above threshold
 *   - "payments"        : Mobile money + bank account placeholders
 *   - "notifications"   : Order / buyer / marketing toggles
 *   - "security"        : Password + 2FA placeholders
 *   - "policies"        : Returns / refunds / terms editors
 *   - "help"            : FAQ + contact info
 *
 * State is local (remember) and saved to a Toast on Save so the UI
 * confirms the action. The backend store-settings endpoints will be
 * wired in a follow-up.
 */
@Composable
fun StoreSettingsDetailScreen(
    section: String,
    onBack: () -> Unit,
) {
    val (title, _) = sectionMeta(section)
    var saveFlash by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScottsTechXColors.PanelLight)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(ScottsTechXColors.BluePrimaryDark)
                .padding(start = 4.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
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
                Icon(
                    Icons.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Text(title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            when (section) {
                "store-profile" -> StoreProfileForm(saveFlash) { saveFlash = true }
                "business-info" -> BusinessInfoForm(saveFlash) { saveFlash = true }
                "store-location" -> StoreLocationForm(saveFlash) { saveFlash = true }
                "delivery" -> DeliveryForm(saveFlash) { saveFlash = true }
                "payments" -> PaymentsForm(saveFlash) { saveFlash = true }
                "notifications" -> NotificationsForm(saveFlash) { saveFlash = true }
                "security" -> SecurityForm(saveFlash) { saveFlash = true }
                "policies" -> PoliciesForm(saveFlash) { saveFlash = true }
                "help" -> HelpForm(saveFlash) { saveFlash = true }
                else -> Text("Unknown section: $section", color = ScottsTechXColors.OnLightSecondary)
            }

            if (saveFlash) {
                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            tint = Color(0xFF1B5E20),
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Saved!", color = Color(0xFF1B5E20), fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

private fun sectionMeta(section: String): Pair<String, String> = when (section) {
    "store-profile" -> "Store Profile" to "Name, logo, description"
    "business-info" -> "Business Information" to "Verify your business"
    "store-location" -> "Store Location" to "Address and pickup points"
    "delivery" -> "Delivery Settings" to "Radius, fee, options"
    "payments" -> "Payment Settings" to "Mobile money, bank accounts"
    "notifications" -> "Notification Settings" to "Buyers, orders, marketing"
    "security" -> "Security" to "Password, 2FA"
    "policies" -> "Store Policies" to "Returns, refunds, terms"
    "help" -> "Help & Support" to "FAQs, contact us"
    else -> section.replaceFirstChar { it.uppercase() } to ""
}

@Composable
private fun StoreProfileForm(saveFlash: Boolean, onSave: () -> Unit) {
    var name by remember { mutableStateOf("TechHub Uganda") }
    var desc by remember { mutableStateOf("Authentic gadgets, original warranty, fast delivery in Kampala.") }
    var logoUrl by remember { mutableStateOf("") }
    Field("Store name", name) { name = it }
    Spacer(Modifier.height(10.dp))
    Field("Description", desc) { desc = it }
    Spacer(Modifier.height(10.dp))
    Field("Logo URL (optional)", logoUrl) { logoUrl = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun BusinessInfoForm(saveFlash: Boolean, onSave: () -> Unit) {
    var legalName by remember { mutableStateOf("TechHub Uganda Ltd") }
    var taxId by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("[email protected]") }
    var phone by remember { mutableStateOf("+256 700 000 000") }
    Field("Legal business name", legalName) { legalName = it }
    Spacer(Modifier.height(10.dp))
    Field("Tax ID / TIN", taxId) { taxId = it }
    Spacer(Modifier.height(10.dp))
    Field("Business email", email) { email = it }
    Spacer(Modifier.height(10.dp))
    Field("Business phone", phone) { phone = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun StoreLocationForm(saveFlash: Boolean, onSave: () -> Unit) {
    var address by remember { mutableStateOf("Kampala Road, Kampala, Uganda") }
    var pickup by remember { mutableStateOf("Kampala — pickup at store") }
    var radiusText by remember { mutableStateOf("10") }
    Field("Store address", address) { address = it }
    Spacer(Modifier.height(10.dp))
    Field("Pickup instructions", pickup) { pickup = it }
    Spacer(Modifier.height(10.dp))
    Field("Service radius (km)", radiusText) { radiusText = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun DeliveryForm(saveFlash: Boolean, onSave: () -> Unit) {
    var feeText by remember { mutableStateOf("5000") }
    var freeAbove by remember { mutableStateOf("100000") }
    var codEnabled by remember { mutableStateOf(true) }
    Field("Delivery fee (UGX)", feeText) { feeText = it }
    Spacer(Modifier.height(10.dp))
    Field("Free delivery above (UGX)", freeAbove) { freeAbove = it }
    Spacer(Modifier.height(14.dp))
    ToggleRow("Cash on delivery", codEnabled) { codEnabled = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun PaymentsForm(saveFlash: Boolean, onSave: () -> Unit) {
    var momoProvider by remember { mutableStateOf("MTN MoMo") }
    var momoNumber by remember { mutableStateOf("+256 700 000 000") }
    var bankName by remember { mutableStateOf("") }
    var bankAcct by remember { mutableStateOf("") }
    Field("Mobile money provider", momoProvider) { momoProvider = it }
    Spacer(Modifier.height(10.dp))
    Field("Mobile money number", momoNumber) { momoNumber = it }
    Spacer(Modifier.height(10.dp))
    Field("Bank name (optional)", bankName) { bankName = it }
    Spacer(Modifier.height(10.dp))
    Field("Bank account (optional)", bankAcct) { bankAcct = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun NotificationsForm(saveFlash: Boolean, onSave: () -> Unit) {
    var orderUpdates by remember { mutableStateOf(true) }
    var buyerMessages by remember { mutableStateOf(true) }
    var marketing by remember { mutableStateOf(false) }
    var weeklyDigest by remember { mutableStateOf(true) }
    ToggleRow("Order updates", orderUpdates) { orderUpdates = it }
    ToggleRow("Buyer messages", buyerMessages) { buyerMessages = it }
    ToggleRow("Marketing & promotions", marketing) { marketing = it }
    ToggleRow("Weekly sales digest", weeklyDigest) { weeklyDigest = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun SecurityForm(saveFlash: Boolean, onSave: () -> Unit) {
    var currentPwd by remember { mutableStateOf("") }
    var newPwd by remember { mutableStateOf("") }
    var twoFA by remember { mutableStateOf(false) }
    Field("Current password", currentPwd) { currentPwd = it }
    Spacer(Modifier.height(10.dp))
    Field("New password", newPwd) { newPwd = it }
    Spacer(Modifier.height(14.dp))
    ToggleRow("Two-factor authentication", twoFA) { twoFA = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun PoliciesForm(saveFlash: Boolean, onSave: () -> Unit) {
    var returnsDays by remember { mutableStateOf("14") }
    var refundNote by remember { mutableStateOf("Refunds processed within 5 business days after we receive the returned item.") }
    var termsNote by remember { mutableStateOf("By selling on ScottsTechX you agree to our marketplace terms.") }
    Field("Returns window (days)", returnsDays) { returnsDays = it }
    Spacer(Modifier.height(10.dp))
    Field("Refund policy", refundNote) { refundNote = it }
    Spacer(Modifier.height(10.dp))
    Field("Store terms", termsNote) { termsNote = it }
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun HelpForm(saveFlash: Boolean, onSave: () -> Unit) {
    Text(
        "Need help managing your store? Reach out to ScottsTechX Seller Support.",
        color = ScottsTechXColors.OnLight,
        fontSize = 14.sp,
    )
    Spacer(Modifier.height(8.dp))
    Text(
        "Email: [email protected]",
        color = ScottsTechXColors.OnLightSecondary,
        fontSize = 12.sp,
    )
    Text(
        "Phone: +256 800 100 100",
        color = ScottsTechXColors.OnLightSecondary,
        fontSize = 12.sp,
    )
    Spacer(Modifier.height(20.dp))
    SaveButton(onSave)
}

@Composable
private fun Field(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.White,
            unfocusedContainerColor = Color.White,
        ),
    )
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            color = ScottsTechXColors.OnLight,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun SaveButton(onSave: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(ScottsTechXColors.BluePrimary)
            .clickable(onClick = onSave)
            .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Check,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text("Save", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}
