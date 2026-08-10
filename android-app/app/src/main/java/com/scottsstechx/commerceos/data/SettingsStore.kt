package com.scottstechx.commerceos.data

import android.content.Context
import android.content.SharedPreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

@Singleton
class SettingsStore @Inject constructor(
    @Named("settings_prefs") private val prefs: SharedPreferences
) {
    private val _useLargeType = MutableStateFlow(prefs.getBoolean(KEY_LARGE_TYPE, true))
    val useLargeType: StateFlow<Boolean> = _useLargeType.asStateFlow()

    private val _useDarkMode = MutableStateFlow(prefs.getBoolean(KEY_DARK_MODE, false))
    val useDarkMode: StateFlow<Boolean> = _useDarkMode.asStateFlow()

    fun setLargeType(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_LARGE_TYPE, enabled).apply()
        _useLargeType.value = enabled
    }

    fun setDarkMode(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DARK_MODE, enabled).apply()
        _useDarkMode.value = enabled
    }

    companion object {
        const val KEY_LARGE_TYPE = "use_large_type"
        const val KEY_DARK_MODE = "use_dark_mode"
    }
}

@Module
@InstallIn(SingletonComponent::class)
object SettingsModule {
    @Provides
    @Singleton
    @Named("settings_prefs")
    fun provideSettingsPreferences(@ApplicationContext context: Context): SharedPreferences {
        return context.getSharedPreferences("commerceos_settings", Context.MODE_PRIVATE)
    }
}
