plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "test.check.inspections"
    compileSdk = 35

    defaultConfig {
        applicationId = "test.check.inspections"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // Backend on OpenShift (CRC). Device resolves this via the Mac's dnsmasq
        // (Wi-Fi DNS = Mac LAN IP) and the Mac's :443 forwarder. The CRC ingress
        // CA is bundled (res/raw/crc_ca.crt) and trusted via network_security_config.
        // (Emulator alternative: "http://10.0.2.2:4000/".)
        //
        // PRODUCTION (Azure/AKS): set this to "https://inspection-api.<your-domain>/".
        // It has a real Let's Encrypt cert, so the bundled crc_ca.crt trust-anchor
        // is no longer required (the system anchors cover it).
        buildConfigField("String", "API_BASE_URL", "\"https://inspection-api.apps-crc.testing/\"")
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    // Keyless OpenStreetMap map for the address picker.
    implementation("org.osmdroid:osmdroid-android:6.1.20")
}
