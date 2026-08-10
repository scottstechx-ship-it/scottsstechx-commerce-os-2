package com.scottsx.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import com.scottsx.app.data.preferences.LocalThemePreference
import com.scottsx.app.data.preferences.ThemePreference
import com.scottsx.app.navigation.AppNavigation
import com.scottsx.app.ui.theme.ColorContext
import com.scottsx.app.ui.theme.LocalColorContext
import com.scottsx.app.ui.theme.ScottsTechXTheme

/**
 * Seed activity. Hosts the NavHost and supplies the [ThemePreference]
 * singleton (persisted theme) + the default [ColorContext.Dark] so
 * the cinematic splash/onboarding screens stay on-brand while the
 * rest of the app follows the user's chosen theme.
 *
 * Also provides [LocalThemePreference] so any screen (e.g. the
 * seller dashboard) that reads `LocalThemePreference.current`
 * directly gets the same singleton instance.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val themePref = remember { ThemePreference.get(applicationContext) }
            CompositionLocalProvider(
                LocalColorContext provides ColorContext.Dark,
                LocalThemePreference provides themePref,
            ) {
                ScottsTechXTheme(
                    context = ColorContext.Dark,
                    themePreference = themePref,
                ) {
                    AppNavigation()
                }
            }
        }
    }
}
