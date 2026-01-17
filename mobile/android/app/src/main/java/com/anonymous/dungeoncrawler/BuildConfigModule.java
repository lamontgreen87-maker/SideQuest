package com.anonymous.dungeoncrawler;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.util.HashMap;
import java.util.Map;

public class BuildConfigModule extends ReactContextBaseJavaModule {
    public BuildConfigModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "BuildConfigModule";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("IS_PLAY", BuildConfig.IS_PLAY);
        constants.put("FLAVOR", BuildConfig.FLAVOR);
        constants.put("APPLICATION_ID", BuildConfig.APPLICATION_ID);
        return constants;
    }
}
