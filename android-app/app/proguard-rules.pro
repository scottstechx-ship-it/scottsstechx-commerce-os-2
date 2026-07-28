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
