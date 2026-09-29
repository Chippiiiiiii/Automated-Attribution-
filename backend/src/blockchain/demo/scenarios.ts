import { build, hashFor, type DemoTransfer } from './builder.js';

/**
 * DEMO ONLY. Synthetic addresses and flows; none of this is real blockchain data.
 * Each scenario is a separate, deterministic sub-ledger used across stages 3–18.
 */
export interface DemoScenario {
  id: string;
  title: string;
  chain: string;
  suspect: string;
  description: string;
  transfers: DemoTransfer[];
}

const bridgeSrcKey = 'bridge-in';

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'S1',
    title: 'Direct exchange deposit',
    chain: 'BITCOIN',
    suspect: 'bc1DEMOSUSPECT101',
    description: 'Suspect deposits straight to an exchange deposit address, which sweeps to a hot wallet.',
    transfers: [
      { chain: 'BITCOIN', key: 's1-fund', from: 'bc1DEMOSOURCE101', to: 'bc1DEMOSUSPECT101', amount: '2.5', token: 'BTC', atHour: 0 },
      { chain: 'BITCOIN', key: 's1-d1', from: 'bc1DEMOSUSPECT101', to: 'bc1DEMODEPOSIT101', amount: '1.2', token: 'BTC', atHour: 24 },
      { chain: 'BITCOIN', key: 's1-d2', from: 'bc1DEMOSUSPECT101', to: 'bc1DEMODEPOSIT101', amount: '0.9', token: 'BTC', atHour: 48 },
      { chain: 'BITCOIN', key: 's1-d3', from: 'bc1DEMOSUSPECT101', to: 'bc1DEMODEPOSIT101', amount: '0.35', token: 'BTC', atHour: 72 },
      { chain: 'BITCOIN', key: 's1-sweep', from: 'bc1DEMODEPOSIT101', to: 'bc1DEMOHOT101', amount: '2.45', token: 'BTC', atHour: 74 },
    ],
  },
  {
    id: 'S1b',
    title: 'Direct exchange deposit (BNB Chain, USDT)',
    chain: 'BNB',
    suspect: '0xSUSPECT102',
    description: 'Single token deposit from suspect to an exchange deposit address on BNB Chain.',
    transfers: [
      { chain: 'BNB', key: 's1b-fund', from: '0xSOURCE102', to: '0xSUSPECT102', amount: '5000', token: 'USDT', atHour: 0 },
      { chain: 'BNB', key: 's1b-dep', from: '0xSUSPECT102', to: '0xDEPOSIT102', amount: '4990', token: 'USDT', atHour: 5 },
      { chain: 'BNB', key: 's1b-sweep', from: '0xDEPOSIT102', to: '0xEXCHANGEHOT102', amount: '4990', token: 'USDT', atHour: 7 },
    ],
  },
  {
    id: 'S2',
    title: 'Two-hop exchange attribution',
    chain: 'ETHEREUM',
    suspect: '0xSUSPECT001',
    description: 'Suspect → intermediary → exchange deposit → exchange hot wallet, plus a small unrelated side transfer.',
    transfers: [
      { chain: 'ETHEREUM', key: 's2-fund', from: '0xSOURCE001', to: '0xSUSPECT001', amount: '12', token: 'ETH', atHour: 0 },
      { chain: 'ETHEREUM', key: 's2-a', from: '0xSUSPECT001', to: '0xINTERMEDIARY001', amount: '8', token: 'ETH', atHour: 24 },
      { chain: 'ETHEREUM', key: 's2-b', from: '0xSUSPECT001', to: '0xINTERMEDIARY001', amount: '3.9', token: 'ETH', atHour: 25 },
      { chain: 'ETHEREUM', key: 's2-c', from: '0xINTERMEDIARY001', to: '0xDEPOSIT001', amount: '11.8', token: 'ETH', atHour: 28 },
      { chain: 'ETHEREUM', key: 's2-noise', from: '0xINTERMEDIARY001', to: '0xUNKNOWN001', amount: '0.05', token: 'ETH', atHour: 29 },
      { chain: 'ETHEREUM', key: 's2-sweep', from: '0xDEPOSIT001', to: '0xEXCHANGEHOT001', amount: '11.75', token: 'ETH', atHour: 48 },
    ],
  },
  {
    id: 'S3',
    title: 'Mixer exposure',
    chain: 'TRON',
    suspect: 'TSUSPECT301',
    description: 'Suspect → mixer → unknown wallet → exchange deposit → hot wallet.',
    transfers: [
      { chain: 'TRON', key: 's3-fund', from: 'TSOURCE301', to: 'TSUSPECT301', amount: '50000', token: 'USDT', atHour: -24 },
      { chain: 'TRON', key: 's3-mix-in', from: 'TSUSPECT301', to: 'TMIXER301', amount: '50000', token: 'USDT', atHour: 0 },
      { chain: 'TRON', key: 's3-mix-out', from: 'TMIXER301', to: 'TUNKNOWN301', amount: '49500', token: 'USDT', atHour: 6 },
      { chain: 'TRON', key: 's3-dep', from: 'TUNKNOWN301', to: 'TDEPOSIT301', amount: '49400', token: 'USDT', atHour: 30 },
      { chain: 'TRON', key: 's3-sweep', from: 'TDEPOSIT301', to: 'THOT301', amount: '49400', token: 'USDT', atHour: 32 },
    ],
  },
  {
    id: 'S4',
    title: 'Cross-chain bridge',
    chain: 'ETHEREUM',
    suspect: '0xSUSPECT401',
    description: 'Ethereum → bridge → Polygon recipient → exchange deposit → hot wallet.',
    transfers: [
      { chain: 'ETHEREUM', key: 's4-fund', from: '0xSOURCE401', to: '0xSUSPECT401', amount: '20', token: 'ETH', atHour: 0 },
      {
        chain: 'ETHEREUM', key: bridgeSrcKey, from: '0xSUSPECT401', to: '0xBRIDGE401', amount: '20', token: 'ETH', atHour: 10,
        chainDetails: { bridgeId: 'BR-401', bridge: 'DEMO Bridge', destChain: 'POLYGON' },
      },
      {
        chain: 'POLYGON', key: 's4-bridge-out', from: '0xBRIDGEPOLY401', to: '0xRECIPIENT401', amount: '19.9', token: 'WETH', atHour: 11,
        chainDetails: { bridgeId: 'BR-401', bridge: 'DEMO Bridge', srcChain: 'ETHEREUM', srcTxHash: hashFor('ETHEREUM', bridgeSrcKey) },
      },
      { chain: 'POLYGON', key: 's4-dep', from: '0xRECIPIENT401', to: '0xDEPOSIT401', amount: '19.9', token: 'WETH', atHour: 13 },
      { chain: 'POLYGON', key: 's4-sweep', from: '0xDEPOSIT401', to: '0xEXCHANGEHOT401', amount: '19.85', token: 'WETH', atHour: 20 },
    ],
  },
  {
    id: 'S5',
    title: 'Multiple candidate VASPs',
    chain: 'SOLANA',
    suspect: 'SolSUSPECT501',
    description: 'Small close deposit to one exchange, a large two-hop deposit to another, and an OTC desk.',
    transfers: [
      { chain: 'SOLANA', key: 's5-fund', from: 'SolSOURCE501', to: 'SolSUSPECT501', amount: '1650', token: 'SOL', atHour: 0 },
      { chain: 'SOLANA', key: 's5-a', from: 'SolSUSPECT501', to: 'SolDEPOSIT501A', amount: '300', token: 'SOL', atHour: 4 },
      { chain: 'SOLANA', key: 's5-b', from: 'SolSUSPECT501', to: 'SolINTERMEDIARY501', amount: '1200', token: 'SOL', atHour: 5 },
      { chain: 'SOLANA', key: 's5-c', from: 'SolINTERMEDIARY501', to: 'SolDEPOSIT501B', amount: '1150', token: 'SOL', atHour: 9 },
      { chain: 'SOLANA', key: 's5-otc', from: 'SolSUSPECT501', to: 'SolOTC501', amount: '100', token: 'SOL', atHour: 12 },
    ],
  },
];

export const DEMO_TRANSFERS = DEMO_SCENARIOS.flatMap((s) => s.transfers.map(build));
