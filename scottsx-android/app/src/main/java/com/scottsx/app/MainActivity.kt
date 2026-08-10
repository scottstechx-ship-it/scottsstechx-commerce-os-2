package com.scottsx.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import com.scottsx.app.navigation.AppNavigation
import com.scottsx.app.ui.theme.ColorContext
import com.scottsx.app.ui.theme.LocalColorContext
import com.scottsx.app.ui.theme.ScottsTechXTheme

/**
 * Seed activity. The brief says "build the three reference screens
 * first, do not add marketplace features" — so this activity is
 * intentionally minimal: pick a dark context, host the NavHost.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(LocalColorContext provides ColorContext.Dark) {
                ScottsTechXTheme(context = ColorContext.Dark) {
                    AppNavigation()
                }
            }
        }
    }
}
