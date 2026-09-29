# Demo scenarios (DEMO data only - synthetic, deterministic)

Defined in `backend/src/blockchain/demo/scenarios.ts`; locked by `backend/src/scenarios.test.ts`. Suspect wallet is added to a case, then *Run attribution* / *Score risk*.

| ID | Chain | Suspect | Scenario | Expected result |
|---|---|---|---|---|
| S1 | BITCOIN | `bc1DEMOSUSPECT101` | Direct exchange deposit | Demo Exchange Alpha, 1 hop, ~97 Confirmed, risk LOW |
| S1b | BNB | `0xSUSPECT102` | Direct USDT deposit | Demo Exchange Beta, 1 hop, ~86 Strongly inferred |
| S2 | ETHEREUM | `0xSUSPECT001` | Two-hop via intermediary | Demo Exchange, 2 hops, ~81 Strongly inferred |
| S3 | TRON | `TSUSPECT301` | Mixer exposure | Demo Exchange Tron, 3 hops, ~58 Probable, risk HIGH (mixerExposure) |
| S4 | ETHEREUM | `0xSUSPECT401` | Cross-chain bridge | Demo Exchange Polygon, 3 hops, ~64 Probable, bridge link shown, risk MEDIUM |
| S5 | SOLANA | `SolSUSPECT501` | Multiple candidate VASPs | 3 candidates, best Demo Exchange Delta, ~72 Probable, OTC exposure |

Notes: factor points are raw (weights sum to 110); the confidence is that sum normalised to 100. All named entities are DEMO and carry the DEMO badge.
