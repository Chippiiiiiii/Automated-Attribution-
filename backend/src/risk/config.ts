import { z } from 'zod';
import { getConfig, setConfig } from '../services/config.service.js';

const points = z.number().min(0).max(100);

export const riskConfigSchema = z
  .object({
    /** Points added when the indicator triggers. Score is the capped sum. */
    points: z.object({
      mixerExposure: points,
      bridgeUsage: points,
      otcExposure: points,
      rapidMovement: points,
      fanOut: points,
      layering: points,
      structuring: points,
    }),
    params: z.object({
      rapidWindowHours: z.number().positive(),
      rapidForwardShare: z.number().min(0).max(1),
      fanOutRecipients: z.number().int().min(2),
      layeringUnlabeledHops: z.number().int().min(2),
      structuringMinTransfers: z.number().int().min(2),
      structuringTolerance: z.number().min(0).max(1),
    }),
    /** Minimum score for each level, ascending. Below `medium` is LOW. */
    levels: z.object({ medium: points, high: points, critical: points }),
  })
  .refine(({ levels: l }) => l.medium < l.high && l.high < l.critical, { message: 'levels must be strictly increasing: medium < high < critical' });

export type RiskConfig = z.infer<typeof riskConfigSchema>;

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  points: { mixerExposure: 40, bridgeUsage: 15, otcExposure: 10, rapidMovement: 15, fanOut: 10, layering: 15, structuring: 10 },
  params: { rapidWindowHours: 24, rapidForwardShare: 0.8, fanOutRecipients: 5, layeringUnlabeledHops: 3, structuringMinTransfers: 3, structuringTolerance: 0.1 },
  levels: { medium: 25, high: 50, critical: 75 },
};

const KEY = 'risk';
export const loadRiskConfig = () => getConfig(KEY, riskConfigSchema, DEFAULT_RISK_CONFIG);
export const saveRiskConfig = (value: unknown, userId: string) => setConfig(KEY, riskConfigSchema, value, userId);
