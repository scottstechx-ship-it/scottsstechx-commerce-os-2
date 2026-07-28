// ScottsTechX Commerce OS — Android client (buyer + driver MVP)
// Top-level build file. Plugins are declared here without applying them so
// module-level build.gradle.kts files can opt in.

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
}
