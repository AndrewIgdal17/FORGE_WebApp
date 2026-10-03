// FORGE Supabase client — single source of truth for the browser's Supabase
// connection (replaces the per-page inline SUPABASE_URL/SUPABASE_ANON_KEY
// blocks). Load order matters: this script must come after the pinned
// supabase-js CDN <script> (which defines the global `supabase`) and after
// `/client-config.js` (which sets window.FORGE_SUPABASE_URL and
// window.FORGE_SUPABASE_KEY from server env — see app/main.py's
// `/client-config.js` route).
(function () {
  'use strict';

  if (!window.FORGE_SUPABASE_URL || !window.FORGE_SUPABASE_KEY) {
    throw new Error(
      'supabase-client.js: window.FORGE_SUPABASE_URL/FORGE_SUPABASE_KEY are missing. ' +
      'Load /client-config.js before /static/supabase-client.js.'
    );
  }

  var _sb = supabase.createClient(window.FORGE_SUPABASE_URL, window.FORGE_SUPABASE_KEY);

  function _getAuthToken() {
    return _sb.auth.getSession().then(function (result) {
      return result.data.session ? result.data.session.access_token : null;
    });
  }

  window._sb = _sb;
  window._getAuthToken = _getAuthToken;
})();
