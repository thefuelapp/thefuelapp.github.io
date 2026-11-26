/* Runs before anything is drawn. Kept in its own file so the page can forbid inline scripts (see the Content-Security-Policy in index.html). */
/* Never run inside someone else's page: a hidden frame is how a tap gets hijacked. */
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.style.display = 'none'; } }
/* iPhone home-screen app. The status-bar style is frozen when the icon is added, so two kinds of install exist:
   - fresh ("default"): the page starts below the status bar and runs to the very bottom of the screen; env(safe-area-inset-bottom) is the home-bar space.
   - old ("black-translucent", class ios-under): the page runs under the status bar, but iOS lays it out SHORT by the status bar's height and never
     paints the strip below it: only the html background colour shows there (class ios-short).
   ios-short is also set if a fresh install ever turns out short. styles.css (v76) does the rest. */
(function () {
  var d = document.documentElement, ios = navigator.standalone === true;
  if (ios || matchMedia('(display-mode: standalone)').matches) d.classList.add('is-standalone');
  if (!ios) return;
  d.classList.add('is-ios-app');
  function fit() {
    var probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none'; d.appendChild(probe);
    var under = probe.offsetHeight > 0; d.removeChild(probe);
    var portrait = matchMedia('(orientation: portrait)').matches;
    var full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
    var gap = full - window.innerHeight; /* a healthy fresh install is short by the status bar only (20 to 62pt); a short one by about 34 more */
    d.classList.toggle('ios-under', under);
    d.classList.toggle('ios-short', under ? gap > 20 : gap > 75);
  }
  fit(); addEventListener('resize', fit); addEventListener('orientationchange', function () { setTimeout(fit, 350); }); addEventListener('pageshow', fit);
})();
