package com.scottsx.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * ScottsTechX brand palette.
 *
 * Visual identity is taken directly from the supplied logo asset —
 * a large blue/silver SX monogram on a deep dark-navy backdrop, with
 * a thin white rule and the wordmark "ScottsTechX" + "ENTERPRISES
 * (U) LTD" + "INNOVATE. INTEGRATE. ELEVATE."
 *
 * Primary accent:    dark blue (#1E40AF) — the deeper "royal" hue
 *                    you see in the bottom half of the logo.
 * Secondary accent:  electric blue (#3B82F6) — the bright highlight
 *                    you see on the top of the SX letters.
 * Tertiary accent:  silver/blue (#60A5FA) — soft UI tint.
 *
 * Backgrounds: near-black / deep navy (#050711, #0C1220).
 *
 * Surfaces: white (#FFFFFF) on the light "panel" screens (login +
 *           signup) so the fields are easy to see.
 */
object ScottsTechXColors {
    // Primary — dark blue (RoyalBlue)
    val BluePrimary = Color(0xFF1E40AF)
    val BluePrimaryLight = Color(0xFF3B82F6)
    val BluePrimaryDark = Color(0xFF1E3A8A)
    val BlueGlow = Color(0x553B82F6)

    // Surfaces — near-black / deep navy
    val BackgroundDark = Color(0xFF050711)
    val SurfacePanelDark = Color(0xFF0C1220)
    val SurfaceElevatedDark = Color(0xFF111827)

    // Surface — white/off-white for the login / signup panel
    val PanelLight = Color(0xFFFFFFFF)
    val BackgroundLight = Color(0xFFF8FAFC)
    val PanelInputLight = Color(0xFFF1F3F7)
    val PanelBorderHint = Color(0xFFE5E7EB)

    // Text
    val OnDark = Color(0xFFFFFFFF)
    val OnDarkSecondary = Color(0xFFB7BCC8)
    val OnDarkMuted = Color(0xFF8A91A0)
    val OnLight = Color(0xFF0F172A)
    val OnLightSecondary = Color(0xFF6B7280)
    val AccentLink = Color(0xFF1E40AF)
}