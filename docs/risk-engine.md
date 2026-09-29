# Risk engine
Heuristic, explainable, configurable (`GET|PUT /api/admin/risk-config`). Indicators are flags for review, not evidence of wrongdoing.
Score = min(100, sum of points of triggered indicators). Levels (defaults): Medium ≥ 25, High ≥ 50, Critical ≥ 75.
Indicators: mixer/tumbler exposure (40), bridge usage (15), OTC exposure (10), rapid pass-through (15: ≥80% forwarded within 24h),
fan-out (10: ≥5 recipients), layering (15: ≥3 consecutive unlabeled hops), structuring (10: ≥3 similar-sized transfers within 10%).
