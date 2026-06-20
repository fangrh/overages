import { z } from 'zod';

const finite = z.number().finite();
const point2 = z.tuple([finite, finite]);
const registeredAssetPathSchema = z.string().regex(
  /^\.overgds-overlays\/registered\/[^/]+\.png$/,
  'registeredAssetPath must stay under .overgds-overlays/registered',
);

export const CorrespondenceSchema = z.object({
  imagePx: point2,
  gdsUm: point2,
  source: z.enum(['manual', 'marker', 'feature']).default('manual'),
  inlier: z.boolean().optional(),
});

export const RegistrationTransformSchema = z.object({
  type: z.enum(['similarity', 'affine']),
  matrix: z.tuple([finite, finite, finite, finite, finite, finite]),
  inverseMatrix: z.tuple([finite, finite, finite, finite, finite, finite]),
  residualRmsUm: finite.nonnegative(),
  maxResidualUm: finite.nonnegative(),
  pairCount: z.number().int().min(0),
  confidence: z.enum(['high', 'medium', 'low']),
  correspondences: z.array(CorrespondenceSchema),
});

export const ImageOverlaySchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  assetPath: z.string().min(1),
  mimeType: z.string().min(1),
  imageSize: z.object({
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
  }).nullable(),
  registeredAssetPath: registeredAssetPathSchema.nullable().optional().default(null),
  registeredBoundsUm: z.tuple([finite, finite, finite, finite]).nullable().optional().default(null),
  registeredImageSize: z.object({
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
  }).nullable().optional().default(null),
  opacity: finite.min(0).max(1),
  visible: z.boolean(),
  transform: RegistrationTransformSchema.nullable(),
  stale: z.object({
    status: z.enum(['fresh', 'stale', 'unknown']),
    reasons: z.array(z.string()),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OverlayPatchSchema = z.object({
  opacity: finite.min(0).max(1).optional(),
  visible: z.boolean().optional(),
  transform: RegistrationTransformSchema.nullable().optional(),
  stale: ImageOverlaySchema.shape.stale.optional(),
  registeredAssetPath: registeredAssetPathSchema.nullable().optional(),
  registeredBoundsUm: z.tuple([finite, finite, finite, finite]).nullable().optional(),
  registeredImageSize: z.object({
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
  }).nullable().optional(),
}).strict();

export type Correspondence = z.infer<typeof CorrespondenceSchema>;
export type RegistrationTransform = z.infer<typeof RegistrationTransformSchema>;
export type ImageOverlay = z.infer<typeof ImageOverlaySchema>;
export type OverlayPatch = z.infer<typeof OverlayPatchSchema>;

export function normalizeOverlayPatch(input: unknown): OverlayPatch {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  for (const key of Object.keys(raw)) {
    if (!(key in OverlayPatchSchema.shape)) {
      throw new Error(`Patch field "${key}" is not allowed`);
    }
  }
  return OverlayPatchSchema.parse(raw);
}
