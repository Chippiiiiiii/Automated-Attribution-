# Attribution engine

Attribution is an **analytical inference**, never confirmed identity.

## Pipeline
1. Build the outbound transaction graph from the suspect wallet (`maxHops` ≤ 6).
2. Look up VASP intel for every node; VASP-labelled nodes are targets.
3. Find time-consistent paths (a hop may only spend funds that already arrived); paths stop at the first VASP.
4. Group paths per VASP, score each with the weighted model, rank by score → hop distance → amount.
5. Emit evidence factors, the path, intermediaries and a `reasoning[]` explaining the choice.

## Scoring
Confidence = round(sum(points) − penalties) / sum(weights) × 100. Default weights: proximity 40, label quality 25,
path consistency 10, repeat interactions 10, hot-wallet relation 10, temporal consistency 5, amount share 10;
mixer-on-path penalty 15. Proximity loses 8 points per extra hop. Hop distance alone is not decisive: amount share
and label quality can make a farther VASP outrank a closer one (demo scenario S5).

## Classes (default thresholds, admin-editable at `PUT /api/admin/attribution-config`)
Confirmed ≥ 90 · Strongly inferred ≥ 75 · Probable ≥ 50 · Possible ≥ 25 · Low confidence below · Unknown when no VASP is reachable.
Thresholds must be strictly decreasing; changes are audited (`CONFIG_UPDATED`).
