package com.chipstack.app;

import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hides Android's own bars while the big screen is up.
 *
 * The web Fullscreen API cannot do this from inside a WebView: it makes an ELEMENT
 * fill the web view, and the status bar and the navigation/gesture bar belong to the
 * activity's window. So the page asks for it here instead, and the window obliges.
 *
 * The wanted state is kept rather than fired once, because Android hands the bars
 * back on its own: coming back from the recents switcher, and on a foldable every
 * time the hinge moves (the activity is not recreated - see the configChanges list
 * in AndroidManifest.xml - but the window is re-laid-out). Re-applying on resume and
 * on a configuration change is what keeps a phone that has been folded and unfolded
 * mid-game from quietly growing a status bar again.
 */
@CapacitorPlugin(name = "Immersive")
public class ImmersivePlugin extends Plugin {

    private boolean wanted = false;

    @PluginMethod
    public void enter(PluginCall call) {
        wanted = true;
        apply();
        call.resolve();
    }

    @PluginMethod
    public void exit(PluginCall call) {
        wanted = false;
        apply();
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        apply();
    }

    @Override
    protected void handleOnConfigurationChanged(android.content.res.Configuration newConfig) {
        apply();
    }

    private void apply() {
        final android.app.Activity activity = getActivity();
        if (activity == null) return;
        final boolean on = wanted;
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) return;
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            if (on) {
                // A swipe from an edge still brings the bars back for a few seconds,
                // so nothing is trapped: the way out of the app is always one swipe.
                controller.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }
        });
    }
}
