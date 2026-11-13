buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        maven {
            url = uri(System.getenv("UC_ANDROID_MEDIA_MAVEN")
                ?: error("Set UC_ANDROID_MEDIA_MAVEN to the inspected native media Maven directory."))
            content {
                includeModule("com.arthenica", "ffmpeg-kit-next")
            }
        }
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

