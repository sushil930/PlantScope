import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { HealthResponse } from '../src/types/plant';
import { type ServerConfig, getServerConfig } from './config';
import { AppApiError } from './errors';
import { type FetchLike, fetchSupportedLanguages } from './plantnetService';
import { fetchDailyQuota } from './quotaService';
import { processPlantScan } from './resultService';

export function createApiRouter(options?: {
  config?: ServerConfig;
  fetchImpl?: FetchLike;
}): express.Router {
  const router = express.Router();
  const resolveConfig = () => options?.config ?? getServerConfig();
  const fetchImpl = options?.fetchImpl ?? fetch;

  // Strict CORS check for cross-origin calls without wildcard credentials
  router.use((req: Request, res: Response, next: NextFunction) => {
    const config = resolveConfig();
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // In-memory upload parser — uploaded plant photos are never persisted to server disk
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 10, // Let validateUploadedImages return a clean TOO_MANY_IMAGES (>5) error
      fileSize: 20 * 1024 * 1024,
    },
  });

  router.get('/health', (_req: Request, res: Response) => {
    const config = resolveConfig();
    const body: HealthResponse = {
      status: 'ok',
      service: 'plantscope-ai',
      plantnetConfigured: Boolean(config.plantnetApiKey),
      plantnetBaseUrl: config.plantnetApiBaseUrl,
      gbifBaseUrl: config.gbifApiBaseUrl,
      limits: {
        maxImages: config.maxImagesPerScan,
        maxImageSizeMb: Math.round(config.maxImageSizeBytes / (1024 * 1024)),
        maxTotalSizeMb: Math.round(config.maxTotalUploadBytes / (1024 * 1024)),
      },
    };
    res.json(body);
  });

  router.get('/quota', async (_req: Request, res: Response) => {
    const config = resolveConfig();
    const quota = await fetchDailyQuota(config, fetchImpl);
    res.json(quota);
  });

  router.get('/languages', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = resolveConfig();
      const langs = await fetchSupportedLanguages(config, fetchImpl);
      res.json(langs);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/scan',
    (req: Request, res: Response, next: NextFunction) => {
      upload.array('images')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            next(
              new AppApiError(
                400,
                'IMAGE_TOO_LARGE',
                'An uploaded photograph exceeds the maximum allowed file size.'
              )
            );
            return;
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            next(
              new AppApiError(
                400,
                'TOO_MANY_IMAGES',
                'Maximum 5 photographs are allowed per scan.'
              )
            );
            return;
          }
          next(new AppApiError(400, 'INVALID_REQUEST', err.message));
          return;
        }
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const config = resolveConfig();
        const files = (Array.isArray(req.files) ? req.files : []).map((f) => ({
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          buffer: f.buffer,
        }));

        const rawIncludeDisease = req.body?.include_disease ?? req.body?.includeDisease ?? 'false';
        const includeDisease =
          rawIncludeDisease === true ||
          rawIncludeDisease === 'true' ||
          rawIncludeDisease === '1';

        const result = await processPlantScan(
          {
            files,
            organs: req.body?.organs,
            language: typeof req.body?.lang === 'string' ? req.body.lang : 'en',
            includeDisease,
          },
          config,
          fetchImpl
        );

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Centralized error formatter (never leaks stack traces or API keys)
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppApiError) {
      res.status(err.status).json(err.toPayload());
      return;
    }

    const fallback = new AppApiError(
      500,
      'UNKNOWN_ERROR',
      'An unexpected server error occurred while processing the request.'
    );
    res.status(fallback.status).json(fallback.toPayload());
  });

  return router;
}
