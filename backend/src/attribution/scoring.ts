import type { AttributionClass } from '../generated/prisma/client.js';
import type { AttributionConfig } from './config.js';
import type { EvidenceFactor } from './types.js';

/** Measured facts about one candidate path; scoring turns these into explainable points. */
export interface ScoringInput {
  hops: number;
  /** Reliability (0–100) of the VASP label at the terminal address. */
  labelConfidence: number;
  /** Smallest hop amount ÷ first hop amount, 0–1. */
  continuity: number;
  /** Transfers into the VASP's addresses across all paths reaching it. */
  interactions: number;
  /** The terminal address is, or leads onward to, a hot wallet of the same VASP. */
  hotWalletRelation: boolean;
  /** Hours between the first hop and the last hop of the path. */
  spanHours: number;
  /** Share (0–1) of the suspect's outflow, in the path's token, that reaches the VASP. */
  amountShare: number;
  mixerOnPath: boolean;
}

export interface Score {
  factors: EvidenceFactor[];
  /** Points after penalties, rounded to 2 dp. */
  score: number;
  /** Normalised 0–100 integer. */
  confidence: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const tier = (value: number, steps: Array<[min: number, fraction: number]>) => steps.find(([min]) => value >= min)?.[1] ?? 0;

export function scoreCandidate(input: ScoringInput, config: AttributionConfig): Score {
  const w = config.weights;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const proximity = Math.max(0, w.proximity - config.proximityStepPerHop * (input.hops - 1));
  const factors: EvidenceFactor[] = [
    {
      factor: 'PROXIMITY',
      points: proximity,
      maxPoints: w.proximity,
      detail: input.hops === 1 ? 'Direct transfer to a VASP-labelled address' : `${input.hops} hops to a VASP-labelled address`,
    },
    {
      factor: 'LABEL_QUALITY',
      points: (w.labelQuality * input.labelConfidence) / 100,
      maxPoints: w.labelQuality,
      detail: `Address label reliability ${input.labelConfidence}/100`,
    },
    {
      factor: 'PATH_CONSISTENCY',
      points: w.pathConsistency * tier(input.continuity, [[0.9, 1], [0.6, 0.6], [0.3, 0.3]]),
      maxPoints: w.pathConsistency,
      detail: `${pct(input.continuity)} of the first-hop amount continues along the whole path (time-ordered)`,
    },
    {
      factor: 'REPEAT_INTERACTIONS',
      points: w.repeatInteractions * tier(input.interactions, [[3, 1], [2, 0.6]]),
      maxPoints: w.repeatInteractions,
      detail: `${input.interactions} transfer(s) into this VASP's addresses`,
    },
    {
      factor: 'HOT_WALLET_RELATION',
      points: input.hotWalletRelation ? w.hotWalletRelation : 0,
      maxPoints: w.hotWalletRelation,
      detail: input.hotWalletRelation ? 'Path address is or forwards to a known hot wallet of this VASP' : 'No known hot-wallet relationship observed',
    },
    {
      factor: 'TEMPORAL_CONSISTENCY',
      points: w.temporalConsistency * tier(-input.spanHours, [[-72, 1], [-168, 0.6]]),
      maxPoints: w.temporalConsistency,
      detail: `Path completed within ${Math.round(input.spanHours)}h`,
    },
    {
      factor: 'AMOUNT_SHARE',
      points: w.amountShare * tier(input.amountShare, [[0.5, 1], [0.25, 0.6], [0.1, 0.3]]),
      maxPoints: w.amountShare,
      detail: `${pct(input.amountShare)} of the suspect's outflow reaches this VASP`,
    },
  ];
  if (input.mixerOnPath) {
    factors.push({
      factor: 'PENALTY_MIXER_ON_PATH',
      points: -config.penalties.mixerOnPath,
      maxPoints: 0,
      detail: 'Path passes through a mixer/tumbler-labelled address, weakening the link',
    });
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const maxPossible = Object.values(w).reduce((a, b) => a + b, 0);
  const confidence = Math.round(Math.min(100, Math.max(0, (raw / maxPossible) * 100)));
  return { factors: factors.map((f) => ({ ...f, points: round2(f.points) })), score: round2(raw), confidence };
}

export function classify(confidence: number, t: AttributionConfig['thresholds']): AttributionClass {
  if (confidence >= t.confirmed) return 'CONFIRMED';
  if (confidence >= t.stronglyInferred) return 'STRONGLY_INFERRED';
  if (confidence >= t.probable) return 'PROBABLE';
  if (confidence >= t.possible) return 'POSSIBLE';
  return 'LOW_CONFIDENCE';
}
