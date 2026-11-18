# Keep Room schemas and annotations
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Sun Mail
-keep class javax.mail.** { *; }
-keep class com.sun.mail.** { *; }
-keep class javax.activation.** { *; }
-dontwarn javax.mail.**
-dontwarn com.sun.mail.**
-dontwarn java.awt.**
