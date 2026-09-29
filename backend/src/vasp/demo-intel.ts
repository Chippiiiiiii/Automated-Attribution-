import type { EntityType } from '../generated/prisma/client.js';
import type { Chain } from '../config/networks.js';

/**
 * DEMO ONLY: synthetic entities whose addresses exist solely in the demo ledger.
 * Nothing here is verified real-world attribution; every entity is stored with isDemo = true.
 */
export const DEMO_SOURCE = 'DEMO synthetic dataset (not real-world attribution)';
export const DEMO_VERIFIED_AT = new Date(Date.UTC(2026, 2, 1));

export interface DemoAddress {
  chain: Chain;
  address: string;
  addressType: EntityType;
  confidence: number;
}

export interface DemoVasp {
  name: string;
  aliases: string[];
  type: EntityType;
  jurisdiction: string;
  notes: string;
  addresses: DemoAddress[];
}

export interface DemoService {
  name: string;
  type: EntityType;
  notes: string;
  addresses: DemoAddress[];
}

const a = (chain: Chain, address: string, addressType: EntityType, confidence: number): DemoAddress => ({ chain, address, addressType, confidence });

export const DEMO_VASPS: DemoVasp[] = [
  {
    name: 'Demo Exchange Alpha', aliases: ['DEMO-ALPHA'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S1 (Bitcoin).',
    addresses: [a('BITCOIN', 'bc1DEMODEPOSIT101', 'DEPOSIT_ADDRESS', 85), a('BITCOIN', 'bc1DEMOHOT101', 'HOT_WALLET', 95)],
  },
  {
    name: 'Demo Exchange Beta', aliases: ['DEMO-BETA'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S1b (BNB Chain).',
    addresses: [a('BNB', '0xDEPOSIT102', 'DEPOSIT_ADDRESS', 80), a('BNB', '0xEXCHANGEHOT102', 'HOT_WALLET', 95)],
  },
  {
    name: 'Demo Exchange', aliases: ['DEMO-EXCHANGE'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S2 (Ethereum) — flagship demo case.',
    addresses: [a('ETHEREUM', '0xDEPOSIT001', 'DEPOSIT_ADDRESS', 90), a('ETHEREUM', '0xEXCHANGEHOT001', 'HOT_WALLET', 98)],
  },
  {
    name: 'Demo Exchange Tron', aliases: ['DEMO-TRON'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S3 (Tron).',
    addresses: [a('TRON', 'TDEPOSIT301', 'DEPOSIT_ADDRESS', 80), a('TRON', 'THOT301', 'HOT_WALLET', 95)],
  },
  {
    name: 'Demo Exchange Polygon', aliases: ['DEMO-POLYGON'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S4 (Polygon side of bridge).',
    addresses: [a('POLYGON', '0xDEPOSIT401', 'DEPOSIT_ADDRESS', 85), a('POLYGON', '0xEXCHANGEHOT401', 'HOT_WALLET', 95)],
  },
  {
    name: 'Demo Exchange Gamma', aliases: ['DEMO-GAMMA'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S5 (Solana), close but small deposit.',
    addresses: [a('SOLANA', 'SolDEPOSIT501A', 'DEPOSIT_ADDRESS', 85)],
  },
  {
    name: 'Demo Exchange Delta', aliases: ['DEMO-DELTA'], type: 'EXCHANGE', jurisdiction: 'DEMO', notes: 'Scenario S5 (Solana), larger two-hop deposit.',
    addresses: [a('SOLANA', 'SolDEPOSIT501B', 'DEPOSIT_ADDRESS', 90)],
  },
  {
    name: 'Demo OTC Desk', aliases: ['DEMO-OTC'], type: 'OTC_SERVICE', jurisdiction: 'DEMO', notes: 'Scenario S5 (Solana); lower-confidence label.',
    addresses: [a('SOLANA', 'SolOTC501', 'CUSTODIAL_WALLET', 65)],
  },
];

export const DEMO_SERVICES: DemoService[] = [
  { name: 'Demo Mixer', type: 'MIXER', notes: 'Scenario S3 (Tron).', addresses: [a('TRON', 'TMIXER301', 'MIXER', 90)] },
  {
    name: 'Demo Bridge', type: 'BRIDGE', notes: 'Scenario S4; contract on both chains.',
    addresses: [a('ETHEREUM', '0xBRIDGE401', 'BRIDGE', 92), a('POLYGON', '0xBRIDGEPOLY401', 'BRIDGE', 92)],
  },
];
