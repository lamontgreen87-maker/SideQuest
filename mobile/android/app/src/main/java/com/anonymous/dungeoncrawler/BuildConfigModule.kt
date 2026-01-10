package com.anonymous.dungeoncrawler

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class BuildConfigModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "BuildConfigModule"

    override fun getConstants(): MutableMap<String, Any> {
        val constants = HashMap<String, Any>()
        constants["FLAVOR"] = BuildConfig.FLAVOR
        constants["APPLICATION_ID"] = BuildConfig.APPLICATION_ID
        constants["IS_PLAY"] = BuildConfig.FLAVOR.contains("play")
        return constants
    }
}
