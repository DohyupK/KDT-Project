"""
Local check: stored probability must equal p_blend (not hard_ox 0.1/0.9).
Does not write to DB. CWD: ai-service/

  python scripts/check_voting_probability.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

AI = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI))
os.chdir(AI)

from voting_predict import predict_voting  # noqa: E402

SAMPLES: list[tuple[str, dict]] = [
    (
        "normalish",
        {
            "d50": 5.1,
            "d90": 12.0,
            "metal_impurity": 0.01,
            "lithium_input": 1.05,
            "additive_ratio": 0.02,
            "process_time": 10.0,
            "sintering_temp": 800.0,
            "humidity": 40.0,
            "tank_pressure": 1.2,
            "operator_id": "OP01",
        },
    ),
    (
        "stressed",
        {
            "d50": 4.5,
            "d90": 9.0,
            "metal_impurity": 0.08,
            "lithium_input": 2.5,
            "additive_ratio": 0.148,
            "process_time": 72.0,
            "sintering_temp": 760.0,
            "humidity": 70.0,
            "tank_pressure": 100.0,
            "operator_id": "OP_A",
        },
    ),
]


def main() -> int:
    ok = True
    stored: list[float] = []
    for label, feats in SAMPLES:
        out = predict_voting(feats)
        prob = float(out["probability"])
        blend = float(out["p_blend"])
        qd = int(out["quality_defect"])
        stored.append(prob)
        match = abs(prob - blend) < 1e-9
        print(
            f"{label}: probability={prob:.6f} p_blend={blend:.6f} "
            f"quality_defect={qd} match={match}"
        )
        if not match:
            ok = False
            print(f"FAIL {label}: probability must equal p_blend (hard_ox still on?)")

    hard_pair = all(abs(v - 0.1) < 1e-9 or abs(v - 0.9) < 1e-9 for v in stored)
    if ok and hard_pair:
        print("WARN both samples landed on 0.1/0.9; still PASS if they equal p_blend")

    if ok:
        print("PASS probability == p_blend")
        return 0
    print("FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
