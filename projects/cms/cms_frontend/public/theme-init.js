// Runs before first paint (loaded as a blocking script, allowed by the CSP) so a saved light
// choice never flashes dark. Dark is the default.
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
