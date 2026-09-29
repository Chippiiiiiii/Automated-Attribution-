export const SUPPORTED_CHAINS = ['BITCOIN', 'ETHEREUM', 'BNB', 'TRON', 'SOLANA', 'POLYGON'] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];
