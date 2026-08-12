package com.scottsx.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.data.domain.SessionCache
import com.scottsx.app.data.Session
import com.scottsx.app.data.remote.V2Client
import com.scottsx.app.ui.theme.ScottsTechXColors
import kotlinx.coroutines.launch

/**
 * Seller inbox. Fetches real conversations where the seller is a
 * participant. Tapping a conversation opens the thread screen.
 */
@Composable
fun SellerMessagesScreen(
    onBack: () -> Unit,
    onOpenThread: (conversationId: String, peerName: String) -> Unit,
) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var conversations by remember { mutableStateOf<List<org.json.JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            loading = true
            val me = Session.current(ctx)
            // Real backend: GET /api/v1/chat/v2/conversations returns all
            // conversations; filter to ones where I am a participant.
            val arr = try {
                V2Client.fetchConversations()
            } catch (e: Exception) { null }
            conversations = buildList {
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val c = arr.optJSONObject(i) ?: continue
                        val sellerId = c.optString("sellerId")
                        val buyerId = c.optString("buyerId")
                        if (me.id == sellerId || me.id == buyerId) {
                            add(c)
                        }
                    }
                }
            }
            loading = false
        }
    }

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
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Loading...", color = ScottsTechXColors.OnLightSecondary)
            }
            conversations.isEmpty() -> EmptyMessagesHint()
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(conversations, key = { it.optString("id") }) { convo ->
                    ConversationRow(
                        convo = convo,
                        onClick = {
                            val peerId = if (convo.optString("buyerId") == SessionCache.userIdOrNull().orEmpty())
                                convo.optString("sellerId") else convo.optString("buyerId")
                            onOpenThread(convo.optString("id"), peerId)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyMessagesHint() {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Filled.ChatBubble, contentDescription = null,
                tint = ScottsTechXColors.BluePrimary, modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.height(12.dp))
            Text("No messages yet", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(
                "When buyers message you about a product, you'll see the conversation here.",
                fontSize = 12.sp,
                color = ScottsTechXColors.OnLightSecondary,
            )
        }
    }
}

@Composable
private fun ConversationRow(convo: org.json.JSONObject, onClick: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val me = Session.current(ctx)
    val otherId = if (convo.optString("buyerId") == me.id) convo.optString("sellerId") else convo.optString("buyerId")
    val otherName = convo.optString("otherPartyName", otherId.take(8))
    val lastMsg = convo.optString("lastMessage", "New conversation")
    val lastTime = convo.optString("lastMessageAt", "")
    val unread = convo.optInt("unreadCount", 0)
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
                .background(ScottsTechXColors.BluePrimary),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = otherName.firstOrNull()?.uppercase() ?: "?",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(otherName, color = ScottsTechXColors.OnLight, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(lastMsg, color = ScottsTechXColors.OnLightSecondary, fontSize = 12.sp, maxLines = 1)
        }
        Column(horizontalAlignment = Alignment.End) {
            if (lastTime.isNotBlank()) Text(lastTime, color = ScottsTechXColors.OnLightSecondary, fontSize = 10.sp)
            if (unread > 0) {
                Spacer(Modifier.width(2.dp))
                Box(
                    modifier = Modifier.size(20.dp).clip(CircleShape).background(Color(0xFFE11D48)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("$unread", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
