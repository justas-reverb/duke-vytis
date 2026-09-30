package lt.dukevytis.tower;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.graphics.drawable.BitmapDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Duke Vytis on a phone: the web build (tools/build-web.mjs, packed into the APK's
 * assets/www/ by tools/build-apk.mjs) in a WebView.
 *
 * The game is ES modules, which a browser will not load from file:// -- so the files are
 * served from an https address this app answers itself (shouldInterceptRequest), the one
 * Android keeps for exactly that (appassets.androidplatform.net), with each file's proper
 * type. Nothing else is fetched: any other address gets a 404, so the game never touches
 * the network. It loads with ?touch, which puts up its on-screen keys (src/ui/touch.js).
 *
 * The game asks the page's shell to quit and about fullscreen (window.gameShell, as the
 * desktop build's Electron preload provides it); the phone's Back is the game's Escape;
 * and leaving the app pauses a run and silences the music (the page's app:background and
 * app:foreground events, main.js).
 */
public class MainActivity extends Activity {
  static final String TAG = "DukeVytis";
  static final String HOST = "appassets.androidplatform.net";
  static final String HOME = "https://" + HOST + "/index.html?touch";

  private WebView web;
  private FrameLayout root;
  /**
   * The loading screen, over the page until the game's first frames are drawn (the page calls
   * gameShell.ready): the game's shield and a spinner on its dark. Under it the page boots -- the
   * WebView starting, 149 modules served from the APK, the painting ahead -- which on a phone was
   * a long black screen with the music already playing ("the apk loading produces a long black
   * screen and music plays before we see anything", 2026-09-29). The page holds its music until
   * the same moment (main.js onScreen).
   */
  private View loading;
  /** The camera's cut-outs, [[l,t,r,b],...] in the window's pixels: the page's gameShell.cutouts(). */
  private volatile String cutouts = "[]";

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    // The whole screen, the camera's cut-out included. The page used to be laid out beside the
    // cut-out, which left a black band down the camera's side of a phone held sideways (the
    // user's Pixel 10, 2026-09-29: "the game doesn't actually seem to go fully full screen").
    // Now the game draws its side wings under it (render/renderer.js wingsFor), and the
    // on-screen keys keep clear of it by the page's safe-area insets (ui/touch.js; index.html
    // asks for them with viewport-fit=cover).
    if (Build.VERSION.SDK_INT >= 28) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
          ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
          : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }
    root = new FrameLayout(this);
    root.setBackgroundColor(0xff05030a);
    // Where the cut-outs are, for the page: nothing is padded, and the on-screen keys stand clear
    // of a hole only where one is beside them (ui/touch.js). The safe insets say only how deep a
    // band down the whole side is -- a punch hole's band is the status bar's height -- so the
    // holes themselves go to the page: asked (gameShell.cutouts) and sent when they move, as the
    // phone turns over ('app:cutouts'). tools/android-smoke.mjs prints the log line.
    root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
      @Override
      public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
        int l = 0, t = 0, r = 0, b = 0;
        StringBuilder holes = new StringBuilder("[");
        if (Build.VERSION.SDK_INT >= 28) {
          DisplayCutout c = insets.getDisplayCutout();
          if (c != null) {
            l = c.getSafeInsetLeft(); t = c.getSafeInsetTop();
            r = c.getSafeInsetRight(); b = c.getSafeInsetBottom();
            for (Rect h : c.getBoundingRects()) {
              if (holes.length() > 1) holes.append(',');
              holes.append('[').append(h.left).append(',').append(h.top).append(',')
                  .append(h.right).append(',').append(h.bottom).append(']');
            }
          }
        }
        String now = holes.append(']').toString();
        Log.i(TAG, "cut-out insets " + l + "," + t + "," + r + "," + b + " holes " + now);
        if (!now.equals(cutouts)) {
          cutouts = now;
          js("window.dispatchEvent(new CustomEvent('app:cutouts',{detail:" + now + "}))");
        }
        // The system's bars back for good -- not a swipe's, which the insets do not count -- are
        // put away again. On the emulator one start in three kept the status bar and the
        // navigation handle over the game from its first frame (2026-09-29): a hide asked for
        // before the system's splash had gone did not hold.
        if (Build.VERSION.SDK_INT >= 30
            && insets.isVisible(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars())) {
          root.post(new Runnable() {
            @Override public void run() { immersive(); }
          });
        }
        return insets;
      }
    });
    setContentView(root);
    makeWebView();
    makeLoading();
    if (Build.VERSION.SDK_INT >= 33) {
      getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
          OnBackInvokedDispatcher.PRIORITY_DEFAULT,
          new OnBackInvokedCallback() {
            @Override public void onBackInvoked() { back(); }
          });
    }
    immersive();
  }

  private void makeWebView() {
    web = new WebView(this);
    web.setBackgroundColor(0xff05030a);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);                    // localStorage: records, settings, replays
    s.setMediaPlaybackRequiresUserGesture(false);    // the music starts with the game
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    web.addJavascriptInterface(new Shell(), "gameShell");
    web.setWebViewClient(new Files());
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage m) {
        int level = m.messageLevel() == ConsoleMessage.MessageLevel.ERROR ? Log.ERROR
            : m.messageLevel() == ConsoleMessage.MessageLevel.WARNING ? Log.WARN : Log.INFO;
        Log.println(level, TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
        return true;
      }
    });
    root.addView(web, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    web.loadUrl(HOME);
  }

  private void makeLoading() {
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setGravity(Gravity.CENTER);
    box.setBackgroundColor(0xff05030a);
    float dp = getResources().getDisplayMetrics().density;
    try (InputStream in = getAssets().open("www/assets/icon.png")) {
      ImageView icon = new ImageView(this);
      BitmapDrawable art = new BitmapDrawable(getResources(), BitmapFactory.decodeStream(in));
      art.setFilterBitmap(false);   // pixel art: no smoothing
      icon.setImageDrawable(art);
      box.addView(icon, new LinearLayout.LayoutParams((int) (112 * dp), (int) (112 * dp)));
    } catch (IOException e) {
      Log.w(TAG, "no icon for the loading screen: " + e);
    }
    ProgressBar spin = new ProgressBar(this);
    spin.setIndeterminate(true);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams((int) (36 * dp), (int) (36 * dp));
    lp.topMargin = (int) (24 * dp);
    box.addView(spin, lp);
    loading = box;
    root.addView(loading, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    // Never for ever: a page that never says it is drawn gets its screen back after 30 s.
    root.postDelayed(new Runnable() {
      @Override public void run() { hideLoading(); }
    }, 30000);
  }

  private void hideLoading() {
    final View v = loading;
    if (v == null) return;
    loading = null;
    v.animate().alpha(0f).setDuration(250).withEndAction(new Runnable() {
      @Override public void run() { root.removeView(v); }
    }).start();
    immersive();
    Log.i(TAG, "the game is on the screen");
  }

  /** The phone's Back is the game's Escape: pause, back out of a screen, quit from the title. */
  private void back() {
    js("(function(){var o={code:'Escape',key:'Escape',bubbles:true,cancelable:true};"
        + "window.dispatchEvent(new KeyboardEvent('keydown',o));"
        + "window.dispatchEvent(new KeyboardEvent('keyup',o));})()");
  }

  @SuppressWarnings("deprecation")
  @Override
  public void onBackPressed() {
    // Below Android 13 only; from 13 the callback registered in onCreate takes Back.
    back();
  }

  @Override
  protected void onPause() {
    js("window.dispatchEvent(new Event('app:background'))");
    if (web != null) web.onPause();
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (web != null) web.onResume();
    js("window.dispatchEvent(new Event('app:foreground'))");
    immersive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
  }

  @Override
  protected void onDestroy() {
    if (web != null) { root.removeView(web); web.destroy(); web = null; }
    super.onDestroy();
  }

  private void js(String code) {
    if (web != null) web.evaluateJavascript(code, null);
  }

  /** The whole screen: no status bar, no navigation bar; a swipe from the edge shows them for a moment. */
  @SuppressWarnings("deprecation")
  private void immersive() {
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController c = getWindow().getInsetsController();
      if (c != null) {
        c.hide(WindowInsets.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
  }

  /** What the page calls as window.gameShell; the desktop build's preload offers the first three. */
  class Shell {
    @JavascriptInterface public boolean isFullscreen() { return true; }
    /** The camera's cut-outs, [[l,t,r,b],...] in the window's pixels (the page divides by its ratio). */
    @JavascriptInterface public String cutouts() { return cutouts; }
    /** The game's first frames are drawn: the loading screen goes (makeLoading). */
    @JavascriptInterface public void ready() {
      runOnUiThread(new Runnable() {
        @Override public void run() { hideLoading(); }
      });
    }
    @JavascriptInterface public void toggleFullscreen() { /* always fullscreen */ }
    @JavascriptInterface public void quit() {
      runOnUiThread(new Runnable() {
        @Override public void run() { finishAndRemoveTask(); }
      });
    }
  }

  /** The game's files, from the APK; nothing from anywhere else. */
  class Files extends WebViewClient {
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
      Uri u = req.getUrl();
      if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return missing();
      String path = u.getPath();
      if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
      if (path.contains("..")) return missing();
      try {
        InputStream in = getAssets().open("www" + path);
        String type = typeOf(path);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(type, type.startsWith("text/") ? "utf-8" : null, 200, "OK", headers, in);
      } catch (IOException e) {
        return missing();
      }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
      return !HOST.equals(req.getUrl().getHost());   // the game never leaves its own page
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
      // The page's process died (memory, most likely): start it again rather than take the app down.
      Log.e(TAG, "the page's process went; loading it again");
      root.removeView(web);
      web.destroy();
      web = null;
      makeWebView();
      return true;
    }
  }

  static WebResourceResponse missing() {
    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
        new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
  }

  static String typeOf(String path) {
    String p = path.toLowerCase();
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".webmanifest")) return "application/manifest+json";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".ogg")) return "audio/ogg";
    if (p.endsWith(".wav")) return "audio/wav";
    if (p.endsWith(".mp3")) return "audio/mpeg";
    return "application/octet-stream";
  }
}
