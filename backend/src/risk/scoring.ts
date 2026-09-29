import type { RiskLevel } from '../generated/prisma/client.js';
import type { RiskConfig } from './config.js';

/** Measured facts about a wallet's neighbourhood; scoring only turns them into explainable indicators. */
export interface RiskFacts {
  mixerHops: number | null;
  bridgeSeen: boolean;
  bridgeDetail: string | null;
  otcHops: number | null;
  /** Hours from first inbound to first outbound transfer of the wallet; null if either is missing. */
  holdHours: number | null;
  /** Outbound ÷ inbound in the same token, 0–1. */
  forwardedShare: number;
  distinctRecipients: number;
  /** Longest chain of consecutive unlabeled addresses leaving the wallet. */
  unlabeledChain: number;
  /** Largest group of same-token outbound transfers within tolerance of each other. */
  similarTransfers: number;
}

export interface RiskIndicator {
  id: string;
  label: string;
  triggered: boolean;
  points: number;
  detail: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  indicators: RiskIndicator[];
}

export function levelFor(score: number, levels: RiskConfig['levels']): RiskLevel {
  if (score >= levels.critical) return 'CRITICAL';
  if (score >= levels.high) return 'HIGH';
  if (score >= levels.medium) return 'MEDIUM';
  return 'LOW';
}

export function assessRisk(f: RiskFacts, config: RiskConfig): RiskAssessment {
  const { points: pts, params: p } = config;
  const ind = (id: string, label: string, triggered: boolean, detail: string): RiskIndicator => ({
    id, label, triggered, points: triggered ? pts[id as keyof typeof pts] : 0, detail,
  });
  const indicators: RiskIndicator[] = [
    ind('mixerExposure', 'Mixer / tumbler exposure', f.mixerHops !== null,
      f.mixerHops !== null ? `A mixer or tumbler is ${f.mixerHops} hop(s) away.` : 'No mixer or tumbler within the analysed range.'),
    ind('bridgeUsage', 'Cross-chain bridge usage', f.bridgeSeen, f.bridgeDetail ?? 'No bridge activity observed.'),
    ind('otcExposure', 'OTC desk exposure', f.otcHops !== null,
      f.otcHops !== null ? `An OTC service is ${f.otcHops} hop(s) away.` : 'No OTC service within the analysed range.'),
    ind('rapidMovement', 'Rapid pass-through of funds',
      f.holdHours !== null && f.holdHours <= p.rapidWindowHours && f.forwardedShare >= p.rapidForwardShare,
      f.holdHours === null
        ? 'Wallet has no both inbound and outbound activity.'
        : `First outflow ${f.holdHours.toFixed(1)}h after first inflow; ${Math.round(f.forwardedShare * 100)}% forwarded (limit ${p.rapidWindowHours}h, ${Math.round(p.rapidForwardShare * 100)}%).`),
    ind('fanOut', 'Fan-out to many recipients', f.distinctRecipients >= p.fanOutRecipients,
      `${f.distinctRecipients} distinct recipient(s) (threshold ${p.fanOutRecipients}).`),
    ind('layering', 'Layering through unlabeled addresses', f.unlabeledChain >= p.layeringUnlabeledHops,
      `Longest unlabeled chain: ${f.unlabeledChain} hop(s) (threshold ${p.layeringUnlabeledHops}).`),
    ind('structuring', 'Repeated similar-sized transfers', f.similarTransfers >= p.structuringMinTransfers,
      `${f.similarTransfers} similar-sized transfer(s) within ${Math.round(p.structuringTolerance * 100)}% (threshold ${p.structuringMinTransfers}).`),
  ];
  const score = Math.min(100, indicators.reduce((s, i) => s + i.points, 0));
  return { score, level: levelFor(score, config.levels), indicators };
}
