plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        create("nativeRustBuild") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:9.3.1")
}

