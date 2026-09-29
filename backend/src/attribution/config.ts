import { z } from 'zod';
import { getConfig, setConfig } from '../services/config.service.js';

const points = z.number().min(0).max(100);

export const attributionConfigSchema = z
  .object({
    /** Maximum points per factor. The score is normalised by their sum, so only ratios matter. */
    weights: z.object({
      proximity: points,
      labelQuality: points,
      pathConsistency: points,
      repeatInteractions: points,
      hotWalletRelation: points,
      temporalConsistency: points,
      amountShare: points,
    }),
    /** Points deducted (before normalisation) when the path contains the named feature. */
    penalties: z.object({ mixerOnPath: points, bridgeCrossing: points.default(10) }),
    /** Proximity points lost for every hop beyond the first. */
    proximityStepPerHop: points,
    /** Minimum normalised confidence for each class, highest first. */
    thresholds: z.object({ confirmed: points, stronglyInferred: points, probable: points, possible: points }),
  })
  .refine(
    ({ thresholds: t }) => t.confirmed > t.stronglyInferred && t.stronglyInferred > t.probable && t.probable > t.possible,
    { message: 'thresholds must be strictly decreasing: confirmed > stronglyInferred > probable > possible' },
  )
  .refine(({ weights }) => Object.values(weights).reduce((a, b) => a + b, 0) > 0, { message: 'at least one weight must be positive' });

export type AttributionConfig = z.infer<typeof attributionConfigSchema>;

export const DEFAULT_ATTRIBUTION_CONFIG: AttributionConfig = {
  weights: { proximity: 40, labelQuality: 25, pathConsistency: 10, repeatInteractions: 10, hotWalletRelation: 10, temporalConsistency: 5, amountShare: 10 },
  penalties: { mixerOnPath: 15, bridgeCrossing: 10 },
  proximityStepPerHop: 8,
  thresholds: { confirmed: 90, stronglyInferred: 75, probable: 50, possible: 25 },
};

const KEY = 'attribution';

export const loadAttributionConfig = () => getConfig(KEY, attributionConfigSchema, DEFAULT_ATTRIBUTION_CONFIG);
export const saveAttributionConfig = (value: unknown, userId: string) => setConfig(KEY, attributionConfigSchema, value, userId);
