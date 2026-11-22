import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getServerConfig } from './server/config';
import { createApiRouter } from './server/routes';

async function startServer() {
  const config = getServerConfig();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Mount PlantScope API routes
  app.use('/api', createApiRouter());

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(path.join(distDir, 'index.html'))) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`PlantScope AI server running on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PlantScope AI server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
