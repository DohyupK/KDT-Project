"""Train all voting members sequentially. Writes completion MD under Downloads/data per member."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parent.parent
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from train_voting_member import MEMBERS, train_member

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_all_voting")

ORDER = [
    "clf_d50",
    "clf_d90",
    "clf_feature",
    "reg_d50",
    "reg_d90",
    "reg_feature",
    "residual_d50",
    "residual_d90",
    "residual_feature",
    "cathode_feature_cap",
    "cathode_feature_res",
    "cathode_feature_clf",
    "cathode_special_cap",
    "cathode_special_res",
    "cathode_special_clf",
]


def main() -> int:
    only = sys.argv[1:] if len(sys.argv) > 1 else ORDER
    for mid in only:
        if mid not in MEMBERS:
            logger.error("Unknown member %s", mid)
            return 2
        cfg = MEMBERS[mid]
        drop_extra = [x for x in cfg.get("drop_extra", "").split(",") if x]
        logger.info("===== START %s =====", mid)
        train_member(
            mid,
            Path(cfg["data"]),
            cfg["target"],
            Path(cfg["out"]),
            cfg["task"],  # type: ignore[arg-type]
            cfg["optuna_db"],
            drop_extra,
        )
        logger.info("===== DONE %s =====", mid)
    logger.info("All requested members finished.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
