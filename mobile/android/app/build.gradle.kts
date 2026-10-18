plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseStoreFile = providers.environmentVariable("ROADWATCH_UPLOAD_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("ROADWATCH_UPLOAD_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ROADWATCH_UPLOAD_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("ROADWATCH_UPLOAD_KEY_PASSWORD").orNull
val releaseSigningValues = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).map { it?.takeIf(String::isNotBlank) }
val releaseSigningConfigured = releaseSigningValues.all { it != null }

android {
    namespace = "gov.roadwatch.roadwatch"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    if (releaseSigningConfigured) {
        signingConfigs {
            create("release") {
                storeFile = file(requireNotNull(releaseStoreFile))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "gov.roadwatch.roadwatch"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

if (!releaseSigningConfigured) {
    gradle.taskGraph.whenReady {
        if (allTasks.any {
                (it.name.startsWith("assemble") || it.name.startsWith("bundle")) &&
                    it.name.endsWith("Release")
            }) {
            throw GradleException(
                "Release builds require ROADWATCH_UPLOAD_STORE_FILE, " +
                    "ROADWATCH_UPLOAD_STORE_PASSWORD, ROADWATCH_UPLOAD_KEY_ALIAS, " +
                    "and ROADWATCH_UPLOAD_KEY_PASSWORD."
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
