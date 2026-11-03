plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

// Meta's MRUK sample builds against these; keep them together when upgrading.
val spatialSdk = "0.14.0"

android {
  namespace = "ai.mojulo.maison3d.furnish"
  compileSdk = 34

  defaultConfig {
    applicationId = "ai.mojulo.maison3d.furnish"
    // Horizon OS is Android 14 (API 34)
    minSdk = 34
    targetSdk = 34
    versionCode = 1
    versionName = "0.1"
  }

  // One committed debug key, so every CI build is signed alike and installs over the last one. It signs
  // sideloaded test builds only; store builds get a real key kept out of the repository.
  signingConfigs {
    getByName("debug") {
      storeFile = file("debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      // Signed with the debug key so the release build can be sideloaded too; store builds get their own key.
      signingConfig = signingConfigs.getByName("debug")
    }
  }

  packaging { resources.excludes.add("META-INF/LICENSE") }
  lint {
    abortOnError = false
    checkReleaseBuilds = false
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("com.meta.spatial:meta-spatial-sdk:$spatialSdk")
  implementation("com.meta.spatial:meta-spatial-sdk-toolkit:$spatialSdk")
  implementation("com.meta.spatial:meta-spatial-sdk-vr:$spatialSdk")
  implementation("com.meta.spatial:meta-spatial-sdk-mruk:$spatialSdk")
}
