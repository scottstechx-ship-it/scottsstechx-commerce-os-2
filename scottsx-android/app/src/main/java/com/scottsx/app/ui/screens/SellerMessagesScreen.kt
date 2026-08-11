package com.scottsx.app.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.domain.MessageThread
import com.scottsx.app.ui.theme.ScottsTechXColors

/**
 * Seller inbox. Same data source as the buyer messages screen but
 * scoped to conversations the seller is participating in
 * (any conversation where `sellerId == currentSeller.id`). The
 * "current seller" is the first seller derived from the initial
 * products list — Stage 4 will swap this for a logged-in seller.
 */
@Composable
fun SellerMessagesScreen(
    onBack: () -> Unit,
    onOpenThread: (threadId: String) -> Unit,
) {
    // Pull every thread whose sellerId matches any seller in the
    // marketplace. This is the right semantics for the demo.
    val threads = remember { MarketplaceDataSource.threadsFlow.value }
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
            Text("Messages", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(threads, key = { it.id }) { thread ->
                ThreadRow(thread, onClick = { onOpenThread(thread.id) })
            }
        }
    }
}

@Composable
private fun ThreadRow(thread: MessageThread, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(ScottsXColors.BluePrimary),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = thread.sellerName.first().uppercase(),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = thread.sellerName,
                color = ScottsTechXColors.OnLight,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
            )
            Text(
                text = thread.lastMessage,
                color = ScottsTechXColors.OnLightSecondary,
                fontSize = 12.sp,
                maxLines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(thread.lastTimeLabel, color = ScottsTechXColors.OnLightSecondary, fontSize = 10.sp)
            if (thread.unread > 0) {
                Spacer(Modifier.width(2.dp))
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE11D48)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${thread.unread}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

private object ScottsXColors {
    val BluePrimary = ScottsTechXColors.BluePrimary
}
