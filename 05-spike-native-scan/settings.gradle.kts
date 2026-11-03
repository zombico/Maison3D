// Spike 05: what a native Quest app (Meta Spatial SDK + MR Utility Kit) knows about the room.
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "maison3d-native-scan"

include(":app")
