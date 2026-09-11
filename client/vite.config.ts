import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { copyFileSync, createReadStream, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ASSET_FILES } from './src/game/asset-manifest.ts';
const base = '/' + (process.env.DAWN_BASE_PATH || '/').replace(/^\/+|\/+$/g, '');
const basePath = base === '/' ? '/' : base + '/';
const stripBase = (url: string) => '/' + url.slice(basePath.length);
const root = fileURLToPath(new URL('.', import.meta.url));
const assetRoot = fileURLToPath(new URL('../web/assets', import.meta.url));
function assets(): Plugin {
  return {
    name: 'dawn-source-assets',
    configureServer(server) {
      server.middlewares.use(`${basePath}assets`, (req, res, next) => {
        let file: string;
        try {
          file = path.resolve(
            assetRoot,
            '.' + decodeURIComponent(new URL(req.url || '/', 'http://local').pathname),
          );
        } catch {
          next();
          return;
        }
        if (
          !file.startsWith(assetRoot + path.sep) ||
          !['.png', '.jpg', '.webp', '.svg'].includes(path.extname(file))
        ) {
          next();
          return;
        }
        try {
          const stat = statSync(file);
          if (!stat.isFile()) {
            next();
            return;
          }
          res.setHeader(
            'Content-Type',
            path.extname(file) === '.svg'
              ? 'image/svg+xml'
              : path.extname(file) === '.jpg'
                ? 'image/jpeg'
                : path.extname(file) === '.webp'
                  ? 'image/webp'
                  : 'image/png',
          );
          res.setHeader('Content-Length', stat.size);
          if (req.method === 'HEAD') res.end();
          else createReadStream(file).on('error', next).pipe(res);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      const output = path.join(root, 'dist/assets');
      mkdirSync(output, { recursive: true });
      for (const file of ASSET_FILES)
        copyFileSync(path.join(assetRoot, file), path.join(output, file));
    },
  };
}
export default defineConfig({
  root,
  base: basePath,
  plugins: [react(), assets()],
  resolve: {
    alias: {
      '@dawn/simulation': fileURLToPath(
        new URL('../packages/simulation/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: { usePolling: true, interval: 500 },
    proxy: {
      [`${basePath}api`]: { target: 'http://127.0.0.1:8178', rewrite: stripBase },
      [`${basePath}ws`]: { target: 'ws://127.0.0.1:8178', ws: true, rewrite: stripBase },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1800 },
});
