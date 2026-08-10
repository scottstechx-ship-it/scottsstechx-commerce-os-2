package com.scottsx.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scottsx.app.ui.theme.ScottsTechXColors

/**
 * Procedural product image — since we don't have real product
 * photos bundled, each product gets a unique gradient + abstract
 * shape based on its category. Looks like premium marketplace
 * imagery without depending on a network or external asset.
 */
@Composable
fun ProductImage(
    imageKey: String,
    categoryLabel: String,
    modifier: Modifier = Modifier,
) {
    val palette = remember(imageKey) {
        palettes[imageKey.hashCode().let { (it and 0x7FFFFFFF) % palettes.size }]
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.linearGradient(
                    colors = palette.gradient,
                    start = Offset(0f, 0f),
                    end = Offset(800f, 800f),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            // Decorative concentric rings
            val cx = w * 0.7f
            val cy = h * 0.3f
            for (i in 0 until 5) {
                val r = w * 0.15f + i * w * 0.12f
                drawCircle(
                    color = palette.ring.copy(alpha = 0.18f - i * 0.025f),
                    radius = r,
                    center = Offset(cx, cy),
                    style = Stroke(width = 1.5f),
                )
            }
            // Decorative blob in lower-left
            rotate(degrees = -12f, pivot = Offset(w * 0.2f, h * 0.85f)) {
                drawOval(
                    color = palette.blob.copy(alpha = 0.25f),
                    topLeft = Offset(-w * 0.2f, h * 0.55f),
                    size = androidx.compose.ui.geometry.Size(w * 0.9f, h * 0.5f),
                )
            }
            // Diagonal accent line
            drawLine(
                color = palette.ring.copy(alpha = 0.4f),
                start = Offset(0f, h * 0.8f),
                end = Offset(w, h * 0.4f),
                strokeWidth = 2f,
            )
            // Triangle in upper-right
            val path = Path().apply {
                moveTo(w * 0.85f, h * 0.1f)
                lineTo(w * 0.95f, h * 0.25f)
                lineTo(w * 0.75f, h * 0.22f)
                close()
            }
            drawPath(path = path, color = palette.blob.copy(alpha = 0.35f))
        }
        Text(
            text = categoryLabel.uppercase(),
            color = Color.White.copy(alpha = 0.92f),
            fontWeight = FontWeight.ExtraBold,
            fontSize = 11.sp,
            letterSpacing = 2.sp,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 8.dp),
        )
    }
}

private data class Palette(
    val gradient: List<Color>,
    val ring: Color,
    val blob: Color,
)

private val palettes = listOf(
    Palette(  // 0 - blue-purple (default)
        gradient = listOf(Color(0xFF3B82F6), Color(0xFF7C3AED)),
        ring = Color.White, blob = Color(0xFF8B5CF6),
    ),
    Palette(  // 1 - cyan-teal
        gradient = listOf(Color(0xFF06B6D4), Color(0xFF0EA5E9)),
        ring = Color.White, blob = Color(0xFF22D3EE),
    ),
    Palette(  // 2 - emerald-lime
        gradient = listOf(Color(0xFF059669), Color(0xFF65A30D)),
        ring = Color.White, blob = Color(0xFFA3E635),
    ),
    Palette(  // 3 - rose-fuchsia
        gradient = listOf(Color(0xFFE11D48), Color(0xFFA21CAF)),
        ring = Color.White, blob = Color(0xFFFB7185),
    ),
    Palette(  // 4 - amber-orange
        gradient = listOf(Color(0xFFF59E0B), Color(0xFFEA580C)),
        ring = Color.White, blob = Color(0xFFFBBF24),
    ),
    Palette(  // 5 - slate-navy
        gradient = listOf(Color(0xFF1E3A8A), Color(0xFF0F172A)),
        ring = ScottsTechXColors.BluePrimaryLight, blob = Color(0xFF3B82F6),
    ),
    Palette(  // 6 - pink-purple
        gradient = listOf(Color(0xFFEC4899), Color(0xFF8B5CF6)),
        ring = Color.White, blob = Color(0xFFF9A8D4),
    ),
)