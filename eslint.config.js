// Flat ESLint config for FORGE's browser code (static/).
//
// Scope: this is a stored-data-sink check, not a general lint gate. The only
// rule enabled is `no-unsanitized/property`, which flags `innerHTML`/
// `outerHTML` assignments that could carry untrusted/stored data. Many
// existing `innerHTML` usages in static/ are static markup (SVG icons,
// layout, hardcoded labels) with no stored data in them — those are
// intentionally left alone; see docs/design notes in scenario-data.js,
// results-renderer.js, input-renderer.js for the specific sinks that were
// converted to textContent/DOM construction.
const noUnsanitized = require('eslint-plugin-no-unsanitized');

module.exports = [
  {
    files: ['static/**/*.js'],
    plugins: {
      'no-unsanitized': noUnsanitized,
    },
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        supabase: 'readonly',
      },
    },
    rules: {
      'no-unsanitized/property': 'error',
    },
  },
];
