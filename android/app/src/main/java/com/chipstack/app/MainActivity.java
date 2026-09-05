package com.chipstack.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before the bridge is built, which is the only point a plugin can
        // still be added to it.
        registerPlugin(ImmersivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
