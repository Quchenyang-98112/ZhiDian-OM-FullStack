import { randomBytes } from 'node:crypto';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { stripLocalhostWsOrigins } from './vite.csp';

function cspNoncePlugin(
  nonce: string,
  e2eTesting: boolean,
  stripLocalhostWs: boolean,
): PluginOption {
  return {
    name: 'nexus-csp-nonce',
    enforce: 'post',
    transformIndexHtml(html) {
      const withNonce = html
        .replaceAll('__CSP_NONCE__', nonce)
        .replaceAll('__NEXUS_E2E_TESTING__', String(e2eTesting))
        .replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`);
      // Vite injects Tailwind HMR styles as runtime <style> tags without a nonce.
      // Allow those tags only on the local dev server; production keeps the strict
      // nonce-based style policy and never ships this development exception.
      const devHtml = withNonce.replace(
        `style-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'unsafe-inline'`,
      );
      // Production shell must not ship dev-only localhost WebSocket origins.
      return stripLocalhostWs ? stripLocalhostWsOrigins(withNonce) : devHtml;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';
  const cspNonce = randomBytes(16).toString('base64');
  const e2eTesting = env.VITE_E2E_TESTING === 'true';

  const plugins: PluginOption[] = [
    // Only the dev-server proxy needs localhost WS origins; every production build
    // (E2E preview and deploy alike) is a backendless static bundle, so strip them.
    cspNoncePlugin(cspNonce, e2eTesting, isProd),

    // React Compiler auto-memoizes — requires @rolldown/plugin-babel in Vite 8.
    // OXC handles TS/JSX compilation; Babel runs only for React Compiler.
    react(),

    // React Compiler via Rolldown Babel preset (replaces old babel-plugin-react-compiler config)
    babel({ presets: [reactCompilerPreset()] }),

    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt', 'icon.svg', 'apple-touch-icon.png'],
      manifest: false, // Use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['**/bundle-stats.html'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB
        sourcemap: false,
        navigateFallback: isProd ? '/Nexus-HEMS-Dash/index.html' : 'index.html',
        navigateFallbackAllowlist: [/^(?!\/__).*/],
        navigationPreload: true,
        runtimeCaching: [
          // ── Weather: Open-Meteo (free, no auth) ──
          // StaleWhileRevalidate → instant offline, revalidate in background.
          // 48h expiration so predictive AI has forecast data even offline.
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'weather-api',
              expiration: { maxEntries: 80, maxAgeSeconds: 172_800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Tariffs: Tibber GraphQL ──
          // NetworkFirst with 6h offline fallback (prices update hourly,
          // but stale prices are better than no prices offline).
          {
            urlPattern: /^https:\/\/api\.tibber\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tibber-api',
              expiration: { maxEntries: 80, maxAgeSeconds: 21_600 },
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Tariffs: aWATTar REST (DE + AT) ──
          // Day-ahead prices published once daily → 12h cache is safe.
          {
            urlPattern: /^https:\/\/api\.awattar\.(de|at)\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'awattar-api',
              expiration: { maxEntries: 80, maxAgeSeconds: 43_200 },
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Tariffs: Octopus Energy (UK/DE Agile) ──
          {
            urlPattern: /^https:\/\/api\.octopus\.energy\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'octopus-api',
              expiration: { maxEntries: 80, maxAgeSeconds: 21_600 },
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── AI: Google Gemini ──
          // MED-07: NetworkOnly — AI API keys must never be cached in ServiceWorker storage.
          // Caching AI responses could expose user queries and API key bearer tokens.
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
          // ── AI: OpenAI ──
          // MED-07: NetworkOnly — see above.
          {
            urlPattern: /^https:\/\/api\.openai\.com\/v1\//,
            handler: 'NetworkOnly',
          },
          // ── AI: Anthropic ──
          // MED-07: NetworkOnly — see above.
          {
            urlPattern: /^https:\/\/api\.anthropic\.com\/v1\//,
            handler: 'NetworkOnly',
          },
          // ── AI: xAI (Grok) ──
          // MED-07: NetworkOnly — see above.
          {
            urlPattern: /^https:\/\/api\.x\.ai\/v1\//,
            handler: 'NetworkOnly',
          },
          // ── AI: Groq ──
          // MED-07: NetworkOnly — see above.
          {
            urlPattern: /^https:\/\/api\.groq\.com\//,
            handler: 'NetworkOnly',
          },
          // ── Static assets: images ──
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 150, maxAgeSeconds: 2_592_000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Static assets: web fonts ──
          {
            urlPattern: /\.(?:woff2?|ttf|otf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 31_536_000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── PWA manifest ──
          {
            urlPattern: /\/manifest\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'manifest',
              expiration: { maxEntries: 1, maxAgeSeconds: 86_400 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      /* Ensure old precache entries from previous SW versions are purged */
      selfDestroying: false,
      devOptions: { enabled: false, type: 'module' },
    }),
  ];

  if (isProd) {
    plugins.push(
      visualizer({
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap', // treemap view for better chunk analysis
      }) as PluginOption,
    );
  }

  return {
    base: isProd ? '/Nexus-HEMS-Dash/' : '/',

    plugins,

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // Pre-bundle heavy deps for instant dev startup
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'react/jsx-runtime',
        'react/compiler-runtime',
        'd3-selection',
        'd3-sankey',
        'motion/react',
        'recharts',
        'zustand',
        'i18next',
        'react-i18next',
        'dexie',
        'lucide-react',
        '@tanstack/react-query',
        'clsx',
        'tailwind-merge',
      ],
    },

    build: {
      target: 'es2022',
      cssCodeSplit: true,
      reportCompressedSize: true,
      // Size-limit enforces gzipped budgets; keep this warning aligned with large lazy chunks.
      chunkSizeWarningLimit: 800,

      rolldownOptions: {
        output: {
          // Deterministic short hashes for aggressive long-term caching
          chunkFileNames: 'assets/[name]-[hash:8].js',
          entryFileNames: 'assets/[name]-[hash:8].js',
          assetFileNames: 'assets/[name]-[hash:8][extname]',

          // Function-based manualChunks avoids circular-reference warnings
          // and gives finer control than object syntax.
          // Strategy: separate heavy libs into dedicated chunks so pages
          // only download what they actually render.
          manualChunks(id) {
            // ── Source code: adapter implementations → own chunk ──
            // Adapters are 2800+ LOC with heavy protocol logic.
            // Splitting them out reduces the main entry chunk significantly.
            if (/\/core\/adapters\/(?:Victron|Modbus|KNX|OCPP|EEBUS|adapter-registry)/.test(id))
              return 'adapters';

            if (!id.includes('node_modules')) return;

            // ── Framework core — loaded on every page ──
            if (/\/react\/|\/react-dom\/|\/scheduler\/|\/react-router/.test(id)) return 'framework';

            // ── Sentry error tracking — lazy-loaded, isolated chunk ──
            if (/\/@sentry\/|\/@sentry-internal\/|\/sentry-internal\//.test(id))
              return 'vendor-sentry';

            // ── D3 visualization — only Sankey pages ──
            // After tree-shaking: only d3-selection + d3-sankey (~30 KB)
            if (/\/d3[-/]|\/d3-sankey\//.test(id)) return 'vendor-d3';

            // ── Recharts — Analytics, Monitoring, Tariffs pages ──
            if (/\/recharts\/|\/victory/.test(id)) return 'vendor-recharts';

            // ── Animation engine — widely used but tree-shakeable ──
            if (/\/motion\//.test(id)) return 'vendor-motion';

            // ── Internationalization ──
            if (/\/i18next/.test(id)) return 'vendor-i18n';

            // ── Icons (tree-shaken per-icon) ──
            if (id.includes('/lucide-react/')) return 'vendor-icons';

            // ── React Query + Devtools ──
            if (id.includes('/@tanstack/')) return 'vendor-query';

            // ── PDF generation + optional deps — dynamically imported on user action ──
            if (
              /\/jspdf\/|\/html2canvas\/|\/dompurify\/|\/purify|\/canvg\/|\/fflate\/|\/fast-png\//.test(
                id,
              )
            )
              return 'vendor-pdf';

            // ── QR code — dynamically imported on user action ──
            if (id.includes('/qrcode/')) return 'vendor-qrcode';

            // ── Date utilities — analytics/monitoring ──
            if (id.includes('/date-fns/')) return 'vendor-date';

            // ── Zustand — tiny, loaded on every page ──
            if (/\/zustand\//.test(id)) return 'framework';

            // ── Dexie (IndexedDB) — offline/storage features ──
            if (/\/dexie\//.test(id)) return 'vendor-dexie';

            // ── Google Gemini AI — only AI pages ──
            if (id.includes('/@google/genai/')) return 'vendor-ai';

            // Local-first AI engines (web-llm / transformers / onnxruntime-web) are
            // deferred (F-03/ADR-029): no longer bundled deps, so no manualChunk here.

            // ── Radix UI primitives ──
            if (id.includes('/@radix-ui/')) return 'vendor-radix';

            // ── MQTT — lazy-loaded by VictronMQTTAdapter ──
            if (/\/mqtt\/|mqtt\.js/.test(id)) return 'vendor-mqtt';

            // ── Micro-utilities ──
            if (/\/clsx\/|\/tailwind-merge\//.test(id)) return 'vendor-utils';

            return undefined;
          },
        },
      },
    },

    // Web Workers use ES modules for tree-shaking
    worker: {
      format: 'es',
    },

    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // In monorepo dev mode: proxy API + WebSocket requests to apps/api (port 3000)
      proxy: {
        // The ZhiDian FastAPI adapter owns only these explicit namespaces.
        '/api/plant': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api/simulation': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api/agents': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api/knowledge': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api/llm': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
        '/metrics': { target: 'http://localhost:3000', changeOrigin: true },
        '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true },
      },
    },
  };
});
