import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.unlimitedclipper.media"
    compileSdk = 36
    defaultConfig {
        minSdk = 29
        consumerProguardFiles("consumer-rules.pro")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

repositories {
    maven {
        url = uri(System.getenv("UC_ANDROID_MEDIA_MAVEN") ?: error("Set UC_ANDROID_MEDIA_MAVEN to the inspected native media Maven directory."))
    }
}

dependencies {
    implementation(project(":tauri-android"))
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.arthenica:ffmpeg-kit-next:9.0.2")
}

