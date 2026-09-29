export type Chain = 'BITCOIN' | 'ETHEREUM' | 'BNB' | 'TRON' | 'SOLANA' | 'POLYGON';
export const CHAINS: Chain[] = ['BITCOIN', 'ETHEREUM', 'BNB', 'TRON', 'SOLANA', 'POLYGON'];

export type AttributionClass = 'CONFIRMED' | 'STRONGLY_INFERRED' | 'PROBABLE' | 'POSSIBLE' | 'LOW_CONFIDENCE' | 'UNKNOWN';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CaseStatus = 'OPEN' | 'ANALYZING' | 'REVIEW' | 'CLOSED';

export interface AuthUser { id: string; email: string; name: string; role: 'ADMIN' | 'INVESTIGATOR' }

export interface CaseRow {
  id: string; caseNumber: string | null; title: string; summary: string | null; status: CaseStatus; createdAt: string;
  _count?: { wallets: number };
}
export interface CaseDetail extends CaseRow {
  wallets: { walletId: string; role: string; note: string; wallet: { id: string; chain: Chain; address: string } }[];
  notes: { id: string; body: string; createdAt: string }[];
}

export interface EvidenceFactor { factor: string; points: number; maxPoints: number; detail: string }
export interface PathHop {
  chain?: string; bridgeId?: string; from: string; to: string; fromLabel: string | null; toLabel: string | null;
  token: string; amount: string; txCount: number; firstTimestamp: string; lastTimestamp: string; txHashes: string[];
}
export interface Candidate {
  vasp: { vaspId: string; name: string; type: string; isDemo: boolean };
  terminalAddress: string; hops: number; amount: string; token: string; interactions: number;
  confidence: number; classification: AttributionClass; explanation: string; evidence: EvidenceFactor[];
}
export interface Attribution {
  id?: string;
  suspectWallet: { chain: Chain; address: string };
  nearestVasp: Candidate | null;
  confidence: number; classification: AttributionClass; distance: number | null;
  evidence: EvidenceFactor[]; transactionPath: PathHop[]; intermediaryAddresses: string[];
  candidates: Candidate[]; reasoning: string[];
  parameters: { maxHops: number; timeRange: { from: string | null; to: string | null } };
  graph: { nodes: number; edges: number; truncated: boolean };
  bridgeLinks?: { bridgeId: string; bridge: string | null; sourceChain: string; destChain: string }[];
  disclaimer: string; generatedAt: string;
}
export interface StoredAttribution {
  id: string; createdAt: string; wallet: { chain: Chain; address: string };
  nearestVasp: { name: string; isDemo: boolean } | null; confidence: number; classification: AttributionClass;
  distance: number | null; detail: Attribution;
}

export interface RiskIndicator { id: string; label: string; triggered: boolean; points: number; detail: string }
export interface RiskReport { score: number; level: RiskLevel; indicators: RiskIndicator[]; disclaimer: string; generatedAt: string }
export interface StoredRisk { id: string; createdAt: string; wallet: { chain: Chain; address: string }; score: number; level: RiskLevel; detail: RiskReport }

export interface AuditEntry { id: string; action: string; target: string | null; createdAt: string; user: string | null; metadata: Record<string, unknown> }

export interface Summary {
  casesByStatus: Partial<Record<CaseStatus, number>>; wallets: number; riskLevels: Partial<Record<RiskLevel, number>>;
  latestAttributions: { id: string; caseId: string; caseNumber: string | null; createdAt: string; wallet: string; vasp: string | null; confidence: number; classification: AttributionClass }[];
}

export interface VaspRow { id: string; jurisdiction: string; aliases: string[]; entity: { name: string; type: string; isDemo: boolean; source: string; notes: string }; _count: { addresses: number } }

export interface GraphNodeDto {
  key: string; chain: Chain; address: string; depth: number; inDegree: number; outDegree: number;
  intel: { name: string; type: string; addressType: string; isVasp: boolean; confidence: number; isDemo: boolean } | null;
}
export interface GraphEdgeDto {
  from: string; to: string; chain: Chain; token: string; totalAmount: string; txCount: number; firstSeen: string; lastSeen: string;
}
export interface GraphData {
  root: string; direction: 'outbound' | 'inbound'; maxHops: number; truncated: boolean;
  nodes: GraphNodeDto[]; edges: GraphEdgeDto[];
  bridgeLinks: { bridgeId: string; bridge: string | null; sourceChain: string; destChain: string }[];
}

export type SahyogStatus = 'PREPARED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED';
export interface SahyogRequest {
  id: string; kind: 'SYNC' | 'DISCLOSURE' | 'FREEZE'; status: SahyogStatus; payload: Record<string, unknown>;
  legalReference: string | null; mockReference: string | null; history: { status: SahyogStatus; at: string }[];
  submittedAt: string | null; createdAt: string;
}

export interface TransferDto {
  txHash: string; transferIndex: number; chain: Chain; from: string; to: string;
  amount: string; token: string; timestamp: string; blockNumber: number; status: string;
}
