# ScottsTechX — ProGuard rules for the :app release build.
# kotlinx.serialization requires reflection metadata for its @Serializable
# classes to survive R8. Keep them.

-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.scottstechx.commerceos.**$$serializer { *; }
-keepclassmembers class com.scottstechx.commerceos.** {
    *** Companion;
}
-keepclasseswithmembers class com.scottstechx.commerceos.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp / Retrofit
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keepattributes Signature
-keepattributes Exceptions

# v0.21.0: Retrofit's interface methods need to survive R8 so that
# reflection-generated proxies can find them. Without this, the
# release build crashes with "method not found" the first time any
# API is called.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keepclasseswithmembers,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations

# v0.21.0: Hilt-generated entry points. The assembler-level generated
# classes for ViewModels (e.g. *HiltModules$KeyModule) need to be kept
# by name so the Hilt lookup at runtime works.
-keep class * extends dagger.hilt.android.internal.lifecycle.HiltViewModelFactory
-keep class com.scottstechx.commerceos.**_HiltModules$* { *; }
-keep class com.scottstechx.commerceos.**_Factory { *; }
-keep class com.scottstechx.commerceos.**_MembersInjector { *; }

# v0.21.0: kotlinx.coroutines internal classes referenced by the
# Retrofit suspend overloads. Without these, R8 occasionally removes
# ContinuationImpl symbols that the suspend machinery depends on.
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.flow.**

# v0.21.0: Coil (image loading) uses reflection on Compose ImageVectors.
-dontwarn coil.**
-keep class coil.** { *; }
