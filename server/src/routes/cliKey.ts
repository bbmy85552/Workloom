import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import { apiKeyPrefix, generateApiKey, hashApiKey, maskApiKey } from '../lib/apiKey.js';

export const cliKeyRouter = Router();
cliKeyRouter.use(requireAuth, requireEmailVerified);

cliKeyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findUnique({ where: { userId: req.user!.id } });
    res.json({
      apiKey: key
        ? {
            id: key.id,
            prefix: key.keyPrefix,
            masked: maskApiKey(key.keyPrefix),
            createdAt: key.createdAt,
            regeneratedAt: key.regeneratedAt,
            lastUsedAt: key.lastUsedAt,
          }
        : null,
    });
  }),
);

cliKeyRouter.post(
  '/regenerate',
  asyncHandler(async (req, res) => {
    const plainKey = generateApiKey();
    const key = await prisma.apiKey.upsert({
      where: { userId: req.user!.id },
      update: {
        keyHash: hashApiKey(plainKey),
        keyPrefix: apiKeyPrefix(plainKey),
        regeneratedAt: new Date(),
        lastUsedAt: null,
      },
      create: {
        userId: req.user!.id,
        keyHash: hashApiKey(plainKey),
        keyPrefix: apiKeyPrefix(plainKey),
      },
    });
    res.json({
      apiKey: {
        id: key.id,
        key: plainKey,
        prefix: key.keyPrefix,
        masked: maskApiKey(key.keyPrefix),
        createdAt: key.createdAt,
        regeneratedAt: key.regeneratedAt,
        lastUsedAt: key.lastUsedAt,
      },
    });
  }),
);

cliKeyRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    await prisma.apiKey.delete({ where: { userId: req.user!.id } }).catch(() => undefined);
    res.json({ ok: true });
  }),
);
