package com.scottsx.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import android.app.Activity

/**
 * ScottsTechX uses a contextual color scheme (the login / sign-up
 * screens are light-themed because their panels are white; the
 * onboarding and alt-login screens are dark/immersive). Select via
 * [LocalColorContext].
 */
enum class ColorContext {
    /** Cinematic screens — onboarding, alt-login. */
    Dark,
    /** Login / sign-up screen with white panel. */
    Light,
}

val LocalColorContext = compositionLocalOf { ColorContext.Dark }

private val DarkColors = darkColorScheme(
    primary = ScottsTechXColors.BluePrimary,
    onPrimary = ScottsTechXColors.OnDark,
    primaryContainer = ScottsTechXColors.BluePrimaryDark,
    onPrimaryContainer = ScottsTechXColors.OnDark,
    secondary = ScottsTechXColors.BluePrimaryLight,
    onSecondary = ScottsTechXColors.OnDark,
    background = ScottsTechXColors.BackgroundDark,
    onBackground = ScottsTechXColors.OnDark,
    surface = ScottsTechXColors.SurfacePanelDark,
    onSurface = ScottsTechXColors.OnDark,
    surfaceVariant = ScottsTechXColors.SurfaceElevatedDark,
    onSurfaceVariant = ScottsTechXColors.OnDarkSecondary,
    outline = ScottsTechXColors.BlueGlow,
)

private val LightColors = lightColorScheme(
    primary = ScottsTechXColors.BluePrimary,
    onPrimary = ScottsTechXColors.OnDark,
    primaryContainer = ScottsTechXColors.PanelInputLight,
    onPrimaryContainer = ScottsTechXColors.BluePrimaryDark,
    secondary = ScottsTechXColors.BluePrimaryLight,
    onSecondary = ScottsTechXColors.OnDark,
    background = ScottsTechXColors.PanelLight,
    onBackground = ScottsTechXColors.OnLight,
    surface = ScottsTechXColors.PanelLight,
    onSurface = ScottsTechXColors.OnLight,
    surfaceVariant = ScottsTechXColors.PanelInputLight,
    onSurfaceVariant = ScottsTechXColors.OnLightSecondary,
    outline = ScottsTechXColors.PanelBorderHint,
)

@Composable
fun ScottsTechXTheme(
    context: ColorContext = LocalColorContext.current,
    content: @Composable () -> Unit,
) {
    val colors = when (context) {
        ColorContext.Dark -> DarkColors
        ColorContext.Light -> LightColors
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            val lightStatus = context == ColorContext.Light
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = lightStatus
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = lightStatus
        }
    }

    MaterialTheme(
        colorScheme = colors,
        typography = ScottsTechXTypography,
        shapes = ScottsTechXShapes,
        content = content,
    )
}