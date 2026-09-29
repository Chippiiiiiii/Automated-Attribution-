import type { AttributionClass, EntityType } from '../generated/prisma/client.js';
import type { Chain } from '../config/networks.js';

export const ATTRIBUTION_DISCLAIMER =
  'Blockchain attribution is an analytical inference and does not by itself establish beneficial ownership.';

export interface AttributionParams {
  chain: Chain;
  walletAddress: string;
  investigationId?: string;
  maxHops: number;
  timeRange?: { from?: Date; to?: Date };
}

export interface EvidenceFactor {
  factor: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface PathHopView {
  /** Chain the hop happened on (a bridge hop uses the destination chain). */
  chain?: string;
  bridgeId?: string;
  from: string;
  to: string;
  fromLabel: string | null;
  toLabel: string | null;
  token: string;
  amount: string;
  txCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  txHashes: string[];
}

export interface AttributionCandidate {
  vasp: { vaspId: string; entityId: string; name: string; type: EntityType; isDemo: boolean };
  terminalAddress: string;
  terminalAddressType: EntityType;
  /** Hop distance from the suspect to the first VASP-labelled address of this VASP. */
  hops: number;
  /** Most that could have travelled the whole path (smallest hop total). */
  amount: string;
  token: string;
  timestamp: string;
  lastInteraction: string;
  interactions: number;
  path: { nodes: string[]; hops: PathHopView[] };
  intermediaryAddresses: string[];
  evidence: EvidenceFactor[];
  /** Raw weighted points after penalties. */
  score: number;
  /** Score normalised to 0–100. An analytical measure, not legal certainty. */
  confidence: number;
  classification: AttributionClass;
  explanation: string;
}

export interface AttributionResult {
  suspectWallet: { chain: Chain; address: string };
  nearestVasp: AttributionCandidate | null;
  confidence: number;
  classification: AttributionClass;
  distance: number | null;
  evidence: EvidenceFactor[];
  transactionPath: PathHopView[];
  intermediaryAddresses: string[];
  candidates: AttributionCandidate[];
  reasoning: string[];
  parameters: { maxHops: number; timeRange: { from: string | null; to: string | null } };
  graph: { nodes: number; edges: number; truncated: boolean };
  /** Present when the best path crosses a bridge. */
  bridgeLinks?: BridgeLink[];
  disclaimer: string;
  generatedAt: string;
}

export interface BridgeLink {
  bridgeId: string;
  bridge: string | null;
  sourceChain: string;
  destChain: string;
  source: { txHash: string; from: string; to: string; amount: string; token: string; timestamp: string };
  /** Null when the destination-side transfer could not be matched. */
  dest: { txHash: string; from: string; to: string; amount: string; token: string; timestamp: string } | null;
  /** Hop distance from the suspect to the bridge deposit. */
  depositHops: number;
  matchedBy: 'bridgeId' | 'srcTxHash' | null;
}
