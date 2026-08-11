package com.scottsx.app.ui.screens

import com.scottsx.app.data.CartStore

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
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.produceState
import com.scottsx.app.data.remote.ChatTurn
import com.scottsx.app.data.remote.RemoteAssistantClient
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.ai.ScottsTechAi
import com.scottsx.app.data.MarketplaceDataSource
import com.scottsx.app.data.domain.Product
import com.scottsx.app.ui.components.BottomTab
import com.scottsx.app.ui.components.ProductCard
import com.scottsx.app.ui.components.ScottsTechXBottomBar
import com.scottsx.app.ui.theme.ScottsTechXColors
import com.scottsx.app.ui.util.formatUgx
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import com.scottsx.app.data.remote.V2Client
import androidx.compose.material3.Divider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults

/**
 * Stage-2 AI Assistant landing screen.
 *
 * The brief requires:
 *   - "Do not create a fake AI interface that only displays
 *      static responses."
 *   - "If the backend AI is not yet available, create the UI
 *      and service abstraction so it can be connected cleanly
 *      later."
 *
 * We deliver a clean chat-bubble UI with a local keyword-based
 * recommender that returns real products from [MarketplaceDataSource]
 * when the user types one of the suggested queries. The
 * composition is structured to drop in a real backend client by
 * replacing the [recommend] function.
 */
@Composable
fun AiAssistantScreen(
    onBack: () -> Unit,
    onOpenProduct: (com.scottsx.app.data.domain.Product) -> Unit = {},
    onTabSelect: (BottomTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val remote = remember { RemoteAssistantClient() }
    val scope = rememberCoroutineScope()
    var source by remember { mutableStateOf("local") }  // "remote" | "local" — drives the badge in the header
    val messages = remember {
        mutableStateListOf(
            ChatMessage(
                text = "Hi! I'm your ScottsTechX AI Assistant. Ask me to find products, compare options, or suggest items within your budget.",
                isFromUser = false,
            ),
        )
    }
    var input by remember { mutableStateOf("") }
    var bottomTab by remember { mutableStateOf(BottomTab.Home) }

    val suggestions = listOf(
        "Phones under UGX 800,000",
        "Shoes near Kampala",
        "Best laptop for work",
        "Affordable groceries",
        "Trending electronics",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScottsTechXColors.BackgroundLight),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 88.dp),
        ) {
            // Header
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
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.AutoAwesome,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "AI Assistant",
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 19.sp,
                        )
                        Text(
                            text = "Smart recommendations for you",
                            color = Color.White.copy(alpha = 0.85f),
                            fontSize = 11.sp,
                        )
                        // Source badge — drives trust signal for testers.
                        // "remote" = the free-LLM backend answered.
                        // "local"  = backend was unreachable; we're using
                        //             the on-device keyword recommender.
                        Spacer(Modifier.height(6.dp))
                        val badge = if (source == "remote")
                            "●  Remote — apifreellm.com"
                        else
                            "●  Local fallback"
                        Text(
                            text = badge,
                            color = Color.White.copy(alpha = 0.92f),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            // Messages
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(messages.toList(), key = { it.text.hashCode() }) { msg ->
                    ChatBubble(message = msg)
                    if (msg.products.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        androidx.compose.foundation.lazy.LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(msg.products, key = { it.id }) { p ->
                                ProductCard(
                                    product = p,
                                    width = 160.dp,
                                    onClick = { onOpenProduct(p) },
                                    onAddToCart = { CartStore.add(p.id) },
                                )
                            }
                        }
                    }
                }

                // Suggestion chips
                if (messages.size <= 1) {
                    item {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Try asking:",
                            color = ScottsTechXColors.OnLightSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    items(suggestions) { suggestion ->
                                            SuggestionChip(
                            text = suggestion,
                            onClick = {
                                messages.add(ChatMessage(text = suggestion, isFromUser = true))
                                scope.launch {
                                    val reply = askRemoteOrLocal(suggestion, ScottsTechAi.Context(screen = "ai-assistant"))
                                    source = reply.source.label
                                    messages.add(ChatMessage(text = reply.text, isFromUser = false))
                                }
                            },
                        )
                    }
                }
            }

            // Input bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.White),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    androidx.compose.foundation.layout.Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.SmartToy,
                            contentDescription = null,
                            tint = ScottsTechXColors.BluePrimary,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            value = input,
                            onValueChange = { input = it },
                            placeholder = {
                                Text(
                                    text = "Ask me anything...",
                                    color = ScottsTechXColors.OnLightSecondary,
                                    fontSize = 14.sp,
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                focusedTextColor = ScottsTechXColors.OnLight,
                                unfocusedTextColor = ScottsTechXColors.OnLight,
                            ),
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                colors = listOf(ScottsTechXColors.BluePrimary, ScottsTechXColors.BluePrimaryLight),
                            ),
                        )
                        .clickable {
                            if (input.isNotBlank()) {
                                messages.add(ChatMessage(text = input, isFromUser = true))
                                val userInput = input
                                input = ""
                                scope.launch {
                                    val reply = askRemoteOrLocal(userInput, ScottsTechAi.Context(screen = "ai-assistant"))
                                    source = reply.source.label
                                    messages.add(ChatMessage(text = reply.text, isFromUser = false))
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Send,
                        contentDescription = "Send",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }

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
private fun ChatBubble(message: ChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isFromUser) Arrangement.End else Arrangement.Start,
    ) {
        if (!message.isFromUser) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(ScottsTechXColors.BluePrimary, ScottsTechXColors.BluePrimaryLight),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp),
                )
            }
            Spacer(Modifier.width(6.dp))
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(
                    if (message.isFromUser) ScottsTechXColors.BluePrimary
                    else Color.White,
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                text = message.text,
                color = if (message.isFromUser) Color.White else ScottsTechXColors.OnLight,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun SuggestionChip(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = ScottsTechXColors.BluePrimary,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = text,
                color = ScottsTechXColors.OnLight,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
            )
        }
    }
}

/**
 * Local keyword-based recommender. Returns real products from
 * [MarketplaceDataSource] that match the user's query. Replace
 * with a backend call when available.
 */
private fun recommend(query: String): Pair<String, List<Product>> {
    val q = query.lowercase()
    val all = MarketplaceDataSource.allProducts
    val matches = when {
        "phone" in q || "iphone" in q || "samsung" in q || "vivo" in q ->
            all.filter { p ->
                val lc = (p.name + " " + p.shortDescription).lowercase()
                "phone" in lc || "iphone" in lc || "samsung" in lc || "vivo" in lc
            }
        "shoe" in q || "sneaker" in q || "nike" in q || "adidas" in q || "balance" in q ->
            all.filter { p ->
                val lc = (p.name + " " + p.shortDescription).lowercase()
                "shoe" in lc || "sneaker" in lc || "nike" in lc || "adidas" in lc || "balance" in lc
            }
        "laptop" in q || "work" in q || "study" in q ->
            all.filter { p ->
                val lc = (p.name + " " + p.shortDescription + " " + p.description).lowercase()
                "laptop" in lc || "study" in lc || "work" in lc
            }
        "grocery" in q || "groceries" in q || "rice" in q || "oil" in q || "food" in q ->
            all.filter { p -> p.category.displayName.lowercase().contains("grocery") }
        "beauty" in q || "lipstick" in q || "soap" in q || "cosmetic" in q ->
            all.filter { p -> p.category.displayName.lowercase().contains("beauty") }
        else -> all.filter { it.rating >= 4.5f }.take(4)
    }
    val response = when {
        matches.isEmpty() ->
            "I couldn't find anything matching \"$query\". Try one of the suggested categories below."
        else ->
            "Here are ${matches.take(4).size} products I found for \"" + query + "\":"
    }
    return response to matches.take(4)
}

/**
 * A single message in the AI chat.
 */
private data class ChatMessage(
    val text: String,
    val isFromUser: Boolean,
    val products: List<Product> = emptyList(),
)
/**
 * Try the unified AI backend at /api/v1/ai/assistant first. If that
 * fails for any reason (no network, backend disabled, 4xx/5xx), fall
 * back to the local keyword recommender so the UI never gets stuck.
 *
 * Returns the user-visible reply text, an optional list of products
 * to render under the bubble, and a flag indicating which source
 * produced the reply (so the header badge can show "Remote" vs
 * "Local fallback").
 */
private suspend fun askRemoteOrLocal(
    query: String,
    context: ScottsTechAi.Context,
): ScottsTechAi.Reply {
    return ScottsTechAi.ask(
        userMessage = query,
        history = emptyList(),
        context = context,
    )
}


/**
 * Stage 5 — Full chat UI overlay.
 *
 * Real persistence via [V2Client.ask]. Each turn is also mirrored to
 * Firestore via [com.scottsx.app.data.firebase.Mirror] (called inside
 * the AI orchestrator). The bubbles are styled like a modern chat app,
 * with quick-reply chips at the bottom so the user can pick a starter.
 */
@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun RealAiChatScreen(
    onBack: () -> Unit,
    onOpenProduct: (com.scottsx.app.data.domain.Product) -> Unit = {},
    onTabSelect: (BottomTab) -> Unit,
    initialMessage: String? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val turns = remember { mutableStateListOf<ChatTurnUi>() }
    var input by remember { mutableStateOf(initialMessage ?: "") }
    var isSending by remember { mutableStateOf(false) }
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()

    fun send(text: String) {
        if (text.isBlank() || isSending) return
        isSending = true
        turns.add(ChatTurnUi(role = "user", content = text))
        input = ""
        scope.launch {
            val reply = V2Client.ask(text, screen = "ai-chat")
            val text2 = reply?.text
                ?: "I can't reach the AI service right now. Check your connection or try again."
            turns.add(ChatTurnUi(role = "assistant", content = text2, source = reply?.provider ?: "offline"))
            // Persist to Firestore via Mirror
            com.scottsx.app.ai.AiPersonalizationStore.recordAiOpened()
            isSending = false
            try { listState.animateScrollToItem(turns.size - 1) } catch (_: Throwable) {}
        }
    }

    LaunchedEffect(Unit) {
        com.scottsx.app.ai.AiPersonalizationStore.recordAiOpened()
        // Also record a category signal so the AI personalization
        // pipeline knows the user is using the AI assistant.
        V2Client.recordSignal("category", "AI Assistant")
        if (initialMessage != null) send(initialMessage)
    }

    androidx.compose.material3.Scaffold(
        topBar = {
            androidx.compose.material3.TopAppBar(
                title = {
                    androidx.compose.foundation.layout.Row(
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    ) {
                        androidx.compose.material3.Icon(
                            androidx.compose.material.icons.Icons.Filled.SmartToy,
                            contentDescription = null,
                            tint = ScottsTechXColors.Primary,
                        )
                        androidx.compose.foundation.layout.Spacer(Modifier.width(8.dp))
                        androidx.compose.material3.Text("ScottsTechX AI", fontWeight = FontWeight.SemiBold)
                    }
                },
                navigationIcon = {
                    androidx.compose.material3.IconButton(onClick = onBack) {
                        androidx.compose.material3.Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    androidx.compose.material3.IconButton(onClick = {
                        scope.launch { V2Client.clearAiMemory() }
                        turns.clear()
                    }) {
                        androidx.compose.material3.Icon(
                            androidx.compose.material.icons.Icons.Filled.AutoAwesome,
                            contentDescription = "Clear AI memory",
                        )
                    }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = ScottsTechXColors.Background,
                    titleContentColor = ScottsTechXColors.TextPrimary,
                    navigationIconContentColor = ScottsTechXColors.TextPrimary,
                    actionIconContentColor = ScottsTechXColors.Primary,
                ),
            )
        },
        bottomBar = {
            ScottsTechXBottomBar(
                selected = BottomTab.Ai,
                onSelect = onTabSelect,
            )
        },
        containerColor = ScottsTechXColors.Background,
    ) { padding ->
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            // Quick replies
            androidx.compose.foundation.lazy.LazyRow(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    "What's near me?",
                    "Cheapest Samsung A55",
                    "Summarize my transactions",
                    "Find a phone under 1,000,000 UGX",
                ).forEach { q ->
                    item {
                        QuickReplyChip(q) { send(q) }
                    }
                }
            }

            androidx.compose.material3.Divider(color = ScottsTechXColors.Divider)

            // Chat history
            androidx.compose.foundation.lazy.LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp),
            ) {
                if (turns.isEmpty()) {
                    item { EmptyAiState() }
                } else {
                    items(turns) { turn -> Bubble(turn) }
                }
                if (isSending) {
                    item {
                        Row(
                            Modifier.fillMaxWidth().padding(start = 4.dp),
                            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Start,
                        ) {
                            androidx.compose.material3.CircularProgressIndicator(
                                color = ScottsTechXColors.Primary,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(16.dp),
                            )
                            androidx.compose.foundation.layout.Spacer(Modifier.width(8.dp))
                            androidx.compose.material3.Text("Thinking…", color = ScottsTechXColors.TextSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }

            // Composer
            androidx.compose.material3.Divider(color = ScottsTechXColors.Divider)
            androidx.compose.foundation.layout.Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                androidx.compose.material3.OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { androidx.compose.material3.Text("Ask ScottsTechX AI…") },
                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ScottsTechXColors.Primary,
                        unfocusedBorderColor = ScottsTechXColors.Divider,
                        cursorColor = ScottsTechXColors.Primary,
                    ),
                    maxLines = 4,
                )
                androidx.compose.foundation.layout.Spacer(Modifier.width(8.dp))
                androidx.compose.material3.IconButton(
                    onClick = { send(input) },
                    enabled = input.isNotBlank() && !isSending,
                ) {
                    androidx.compose.material3.Icon(
                        Icons.Filled.Send,
                        contentDescription = "Send",
                        tint = if (input.isNotBlank()) ScottsTechXColors.Primary else ScottsTechXColors.Divider,
                    )
                }
            }
        }
    }
}

private data class ChatTurnUi(
    val role: String, // "user" | "assistant"
    val content: String,
    val source: String = "",
)

@Composable
private fun Bubble(turn: ChatTurnUi) {
    val isUser = turn.role == "user"
    val bg = if (isUser) ScottsTechXColors.Primary else ScottsTechXColors.Surface
    val fg = if (isUser) Color.White else ScottsTechXColors.TextPrimary
    val shape = if (isUser)
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp)
    else
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 4.dp, bottomEnd = 16.dp)
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) androidx.compose.foundation.layout.Arrangement.End else androidx.compose.foundation.layout.Arrangement.Start,
    ) {
        androidx.compose.material3.Surface(
            color = bg,
            shape = shape,
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            androidx.compose.foundation.layout.Column(Modifier.padding(12.dp)) {
                androidx.compose.material3.Text(turn.content, color = fg, fontSize = 14.sp)
                if (turn.source.isNotBlank()) {
                    androidx.compose.foundation.layout.Spacer(Modifier.height(4.dp))
                    androidx.compose.material3.Text(
                        "via ${turn.source}",
                        color = if (isUser) Color.White.copy(alpha = 0.7f) else ScottsTechXColors.TextSecondary,
                        fontSize = 10.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickReplyChip(text: String, onClick: () -> Unit) {
    androidx.compose.material3.Surface(
        shape = RoundedCornerShape(18.dp),
        color = ScottsTechXColors.Surface,
        modifier = Modifier.clickable { onClick() },
    ) {
        androidx.compose.material3.Text(
            text,
            color = ScottsTechXColors.TextPrimary,
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun EmptyAiState() {
    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Icon(
            androidx.compose.material.icons.Icons.Filled.SmartToy,
            contentDescription = null,
            tint = ScottsTechXColors.Primary,
            modifier = Modifier.size(64.dp),
        )
        androidx.compose.foundation.layout.Spacer(Modifier.height(16.dp))
        androidx.compose.material3.Text(
            "Ask me anything",
            color = ScottsTechXColors.TextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.height(8.dp))
        androidx.compose.material3.Text(
            "I can help you find products, summarize your transactions, draft a receipt, or just chat. " +
                "I'll only suggest things I have data for — and I'll always say when I'm guessing.",
            color = ScottsTechXColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}