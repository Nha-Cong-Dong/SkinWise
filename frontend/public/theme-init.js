// Sets the colour theme before the first paint (CSP allows no inline script, so this is a file).
// Same rules as src/theme.ts: "light" / "dark" as chosen, otherwise the device's setting; the
// reviewers' page (#review) stays light.
;(function () {
  var pref = 'system'
  try {
    pref = localStorage.getItem('skinwise.theme') || 'system'
  } catch {
    // Storage blocked: follow the device.
  }
  var dark =
    location.hash !== '#review' &&
    (pref === 'dark' ||
      (pref !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches))
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#11111f' : '#f5f2f8')
})()
