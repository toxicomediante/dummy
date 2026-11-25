package com.yosesproject.dummy;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private Insets safeArea = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                publishSafeArea(webView);
            }
        });
        super.onCreate(savedInstanceState);
        applyEdgeToEdge();
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            safeArea = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            // Only the keyboard may resize the native viewport; system bars
            // and the camera cutout must never create a native margin.
            int keyboardBottom = insets.isVisible(WindowInsetsCompat.Type.ime())
                    ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            view.setPadding(0, 0, 0, keyboardBottom);
            if (getBridge() != null) publishSafeArea(getBridge().getWebView());
            if (keyboardBottom > 0) {
                return new WindowInsetsCompat.Builder(insets)
                        .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                        .setVisible(WindowInsetsCompat.Type.ime(), false).build();
            }
            return insets;
        });
        ViewCompat.requestApplyInsets(decor);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyEdgeToEdge();
            ViewCompat.requestApplyInsets(getWindow().getDecorView());
        }
    }

    private void applyEdgeToEdge() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.show(WindowInsetsCompat.Type.systemBars());
    }

    private void publishSafeArea(WebView webView) {
        if (webView == null) return;
        float density = getResources().getDisplayMetrics().density;
        String script = "(function(){var r=document.documentElement;if(!r)return;"
                + "r.classList.add('dummy-native');"
                + "r.style.setProperty('--dummy-safe-top','" + Math.round(safeArea.top / density) + "px');"
                + "r.style.setProperty('--dummy-safe-right','" + Math.round(safeArea.right / density) + "px');"
                + "r.style.setProperty('--dummy-safe-bottom','" + Math.round(safeArea.bottom / density) + "px');"
                + "r.style.setProperty('--dummy-safe-left','" + Math.round(safeArea.left / density) + "px');"
                + "})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
