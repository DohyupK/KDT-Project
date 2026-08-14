# -*- coding: utf-8 -*-
"""
plant_feeder_live.py — 가상 공장 실시간 데이터 피더 (학생 배포용 · 즉석 생성판)
================================================================
서비스를 켜두면 10분(설정 가능)마다 LOT 1개를 **그 자리에서 생성**하여
현재 시각 기준으로 여러분의 MariaDB에 직접 적재한다. 별도 데이터 파일 불필요.

  - 공정변수 10개 : 생산 즉시  → lots (+ lot_results stub: lot_id만, qd/residual NULL)
  - 불량 판정     : 생산 +60분 → lot_results.quality_defect
  - 잔류 리튬     : 생산 +24h  → lot_results.residual_li

실행 (본인 프로젝트에서 별도 서비스로):
  pip install pymysql numpy
  python plant_feeder_live.py

  모노레포 루트 `.env`의 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME 을 자동으로 읽는다.
  이미 OS에 설정된 환경변수가 있으면 그쪽이 우선이다.

환경변수:
  DB_HOST / DB_PORT(3306) / DB_USER / DB_PASSWORD / DB_NAME
  SPEED=1                시간 가속 (60이면 10초당 LOT 1개, 실측 지연도 60배 단축)
  LOT_INTERVAL_MIN=10    생산 간격
  DEFECT_DELAY_MIN=60    불량 판정 도착 지연
  RESIDUAL_DELAY_MIN=1440  잔류 리튬 도착 지연
  BACKFILL=12            첫 실행 시 미리 넣어줄 과거 LOT 수
  LOTS_TABLE=lots / RESULTS_TABLE=lot_results   적재 테이블명
                         lots 는 id+timestamp (운영 스키마). seq 는 lot_results 에만 있음.
  DRY_RUN=1              DB 없이 콘솔 출력만 (동작 확인용)

주의: 같은 폴더에 생기는 feeder_state.json(도착 대기 중인 검사 결과)은 열어보지 말 것.
"""
import base64
import json
import os
import time
from datetime import datetime

import numpy as np


def _load_root_env():
    """모노레포 루트 `.env`를 프로세스 환경에 반영 (이미 있는 키는 덮지 않음)."""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(os.path.dirname(here), ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.lower().startswith("export "):
                line = line[7:].strip()
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = val


_load_root_env()

SPEED = float(os.environ.get("SPEED", "1"))
INTERVAL = float(os.environ.get("LOT_INTERVAL_MIN", "10"))
DEFECT_DELAY = float(os.environ.get("DEFECT_DELAY_MIN", "60"))
RESIDUAL_DELAY = float(os.environ.get("RESIDUAL_DELAY_MIN", "1440"))
BACKFILL = int(os.environ.get("BACKFILL", "12"))
DRY = os.environ.get("DRY_RUN", "0") == "1"
SIMPLE = os.environ.get("SIMPLE_MODE", "0") == "1"   # 1이면 결과값까지 한 테이블 한 행에 즉시


def _ident(name, default):
    cleaned = "".join(ch if (ch.isalnum() or ch == "_") else "" for ch in (name or ""))
    return cleaned or default


T_LOTS = _ident(os.environ.get("LOTS_TABLE", "lots"), "lots")
T_RES = _ident(os.environ.get("RESULTS_TABLE", "lot_results"), "lot_results")
APP_LOTS = False  # True: 운영 lots (id, timestamp). False: 피더 전용 (seq, lot_id, produced_at)
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "feeder_state.json")

NUM_VARS = ["d50", "d90", "metal_impurity", "lithium_input", "additive_ratio",
            "process_time", "sintering_temp", "humidity", "tank_pressure"]

# ── 공정 정의 (평균, 표준편차, 하한, 상한) ──────────────────────
VAR_DEF = {
    "d50": (4.5, 0.6, 2.5, 7.5), "d90": (9.0, 1.0, 5.5, 13.0),
    "metal_impurity": (0.024, 0.007, 0.005, 0.06), "lithium_input": (2.5, 0.5, 1.0, 4.0),
    "additive_ratio": (0.148, 0.01, 0.11, 0.19), "process_time": (72.0, 9.0, 45.0, 100.0),
    "sintering_temp": (800.0, 25.0, 740.0, 860.0), "humidity": (50.0, 8.0, 28.0, 72.0),
    "tank_pressure": (100.0, 3.0, 90.0, 110.0),
}
CORR = [("d50", "d90", 0.82), ("sintering_temp", "process_time", -0.35),
        ("metal_impurity", "lithium_input", 0.20)]
OPS = (["OP_A", "OP_B", "OP_C"], [0.40, 0.35, 0.25])
MISSING_RATE = 0.03

# ── 품질 산식 보정 상수 (배포 데이터셋과 동일 분포가 되도록 사전 계산) ──
_POP = {"metal_impurity": (0.02406, 0.00702), "humidity": (50.027, 8.000),
        "lithium_input": (2.50285, 0.49774), "sintering_temp": (799.887, 24.650)}
_CLF_BIAS, _CLF_NOISE = -6.126, 1.0
_RES_MU, _RES_SD, _RES_BASE, _RES_SCALE, _RES_OBS = 1.6046, 2.8370, 3200.0, 700.0, 120.0
_DRIFT_W, _DRIFT_SPAN = 0.4, 14320.0

_names = list(VAR_DEF.keys())
_R = np.eye(len(_names))
for a, b, r in CORR:
    i, j = _names.index(a), _names.index(b)
    _R[i, j] = _R[j, i] = r
_L = np.linalg.cholesky(_R)


def _z(name, v):
    m, s = _POP[name]
    return (v - m) / s


def gen_lot(seq):
    """LOT 1개 생성 — 공정변수(결측 포함)와 검사 결과(불량·잔류리튬)를 반환."""
    rng = np.random.default_rng(seq)                      # seq 기준 재현 가능
    z = _L @ rng.standard_normal(len(_names))
    true = {}
    for nm, zi in zip(_names, z):
        m, s, lo, hi = VAR_DEF[nm]
        true[nm] = float(np.clip(m + s * zi, lo, hi))
    op = rng.choice(OPS[0], p=OPS[1])
    drift = _DRIFT_W * min(seq / _DRIFT_SPAN, 1.0)

    t, p = true["sintering_temp"], true["process_time"]
    lc = (1.6 * _z("metal_impurity", true["metal_impurity"])
          + 1.5 * _z("humidity", true["humidity"])
          + 1.3 * ((t - 800.0) / 30.0) ** 2 + 0.8 * ((p - 72.0) / 18.0) ** 2
          + 1.0 * max(_z("metal_impurity", true["metal_impurity"]), 0)
                * max(_z("sintering_temp", t), 0)
          + drift + rng.normal(0, _CLF_NOISE))
    defect = int(rng.random() < 1.0 / (1.0 + np.exp(-(lc + _CLF_BIAS))))

    lr = (1.5 * _z("humidity", true["humidity"])
          + 1.3 * _z("lithium_input", true["lithium_input"])
          + 1.5 * ((t - 800.0) / 30.0) ** 2 + 0.9 * ((p - 72.0) / 18.0) ** 2
          + 1.0 * max(_z("lithium_input", true["lithium_input"]), 0)
                * max(_z("sintering_temp", t), 0)
          + drift + rng.normal(0, 1.0))
    residual = float(np.clip(_RES_BASE + _RES_SCALE * (lr - _RES_MU) / _RES_SD
                             + rng.normal(0, _RES_OBS), 800, 8000))

    obs = {nm: (None if rng.random() < MISSING_RATE else true[nm]) for nm in _names}
    obs["operator_id"] = str(op)
    return obs, defect, round(residual, 1)


# ── 도착 대기 결과 보관 (재시작에도 유지) ───────────────────────
def enc(v): return base64.b64encode(str(v)[::-1].encode()).decode()
def dec(s): return base64.b64decode(s.encode()).decode()[::-1]


def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE, encoding="utf-8"))
    return {}


def save_state(st):
    json.dump(st, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)


# ── DB ──────────────────────────────────────────────────────────
if DRY:
    import sqlite3
    db = sqlite3.connect(":memory:")
    PH, IGNORE = "?", "INSERT OR IGNORE"
else:
    import pymysql
    missing = [k for k in ("DB_USER", "DB_PASSWORD", "DB_NAME") if k not in os.environ]
    if missing:
        raise SystemExit(
            "DB 환경변수가 없습니다: "
            + ", ".join(missing)
            + " — 모노레포 루트 `.env`를 확인하세요."
        )
    db = pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"),
                         port=int(os.environ.get("DB_PORT", "3306")),
                         user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
                         database=os.environ["DB_NAME"], autocommit=True)
    PH, IGNORE = "%s", "INSERT IGNORE"


def q(sql, args=()):
    c = db.cursor()
    c.execute(sql, args)
    if DRY:
        db.commit()
    return c


def table_exists(name):
    if DRY:
        row = q(
            f"SELECT name FROM sqlite_master WHERE type='table' AND name={PH}",
            (name,),
        ).fetchone()
        return bool(row)
    return bool(q(f"SHOW TABLES LIKE {PH}", (name,)).fetchone())


def colset(name):
    if not table_exists(name):
        return set()
    if DRY:
        return {r[1] for r in q(f"PRAGMA table_info({name})").fetchall()}
    return {r[0] for r in q(f"SHOW COLUMNS FROM `{name}`").fetchall()}


cols = ", ".join(f"{v} DOUBLE NULL" for v in NUM_VARS)
existing_lots_cols = colset(T_LOTS)
APP_LOTS = "id" in existing_lots_cols and "seq" not in existing_lots_cols
if not existing_lots_cols:
    if T_LOTS.lower() == "lots":
        q(f"CREATE TABLE IF NOT EXISTS `{T_LOTS}` ("
          f"id VARCHAR(64) NOT NULL PRIMARY KEY, `timestamp` DATETIME NOT NULL, "
          f"{cols}, operator_id VARCHAR(32) NULL)")
        APP_LOTS = True
    elif SIMPLE:
        q(f"CREATE TABLE IF NOT EXISTS `{T_LOTS}` (seq INT PRIMARY KEY, lot_id VARCHAR(24), "
          f"produced_at DATETIME, {cols}, operator_id VARCHAR(8) NULL, "
          f"quality_defect TINYINT NULL, residual_li DOUBLE NULL)")
    else:
        q(f"CREATE TABLE IF NOT EXISTS `{T_LOTS}` (seq INT PRIMARY KEY, lot_id VARCHAR(24), "
          f"produced_at DATETIME, {cols}, operator_id VARCHAR(8) NULL)")
if APP_LOTS or not SIMPLE:
    q(f"CREATE TABLE IF NOT EXISTS `{T_RES}` (seq INT PRIMARY KEY, lot_id VARCHAR(64), "
      f"quality_defect TINYINT NULL, residual_li DOUBLE NULL, measured_at DATETIME)")


def now_str(ts=None):
    return datetime.fromtimestamp(ts or time.time()).strftime("%Y-%m-%d %H:%M:%S")


def max_seq():
    src = T_RES if APP_LOTS else T_LOTS
    row = q(f"SELECT MAX(seq) FROM `{src}`").fetchone()
    return None if not row else row[0]


def produce(seq, produced_ts, state):
    obs, defect, residual = gen_lot(seq)
    lot_id = f"LOT-{datetime.fromtimestamp(produced_ts):%Y%m%d}-{seq:05d}"
    ts = now_str(produced_ts)
    vars_vals = [obs[v] for v in NUM_VARS]
    op = obs["operator_id"]
    if APP_LOTS:
        ph = ", ".join([PH] * (2 + len(NUM_VARS) + 1))
        q(f"{IGNORE} INTO `{T_LOTS}` (id, `timestamp`, {', '.join(NUM_VARS)}, operator_id) "
          f"VALUES ({ph})", [lot_id, ts] + vars_vals + [op])
        if SIMPLE:
            q(f"{IGNORE} INTO `{T_RES}` (seq, lot_id, quality_defect, residual_li, measured_at) "
              f"VALUES ({PH}, {PH}, {PH}, {PH}, {PH})", (seq, lot_id, defect, residual, ts))
            print(f"[생산] {lot_id} 불량={defect} 잔류Li={residual}")
            return
        q(f"{IGNORE} INTO `{T_RES}` (seq, lot_id, quality_defect, residual_li, measured_at) "
          f"VALUES ({PH}, {PH}, NULL, NULL, NULL)", (seq, lot_id))
        state[str(seq)] = {"lot_id": lot_id, "t": produced_ts,
                           "d": enc(defect), "r": enc(residual)}
        print(f"[생산] {lot_id}")
        return
    base_vals = [seq, lot_id, ts] + vars_vals + [op]
    if SIMPLE:
        ph = ", ".join([PH] * (len(base_vals) + 2))
        q(f"{IGNORE} INTO `{T_LOTS}` (seq, lot_id, produced_at, {', '.join(NUM_VARS)}, "
          f"operator_id, quality_defect, residual_li) VALUES ({ph})",
          base_vals + [defect, residual])
        print(f"[생산] {lot_id} 불량={defect} 잔류Li={residual}")
        return
    ph = ", ".join([PH] * len(base_vals))
    q(f"{IGNORE} INTO `{T_LOTS}` (seq, lot_id, produced_at, {', '.join(NUM_VARS)}, operator_id) "
      f"VALUES ({ph})", base_vals)
    q(f"{IGNORE} INTO `{T_RES}` (seq, lot_id, quality_defect, residual_li, measured_at) "
      f"VALUES ({PH}, {PH}, NULL, NULL, NULL)", (seq, lot_id))
    state[str(seq)] = {"lot_id": lot_id, "t": produced_ts,
                       "d": enc(defect), "r": enc(residual)}
    print(f"[생산] {lot_id}")


def deliver(state):
    done = []
    for k, it in state.items():
        age = (time.time() - it["t"]) / 60.0 * SPEED
        if "d" in it and age >= DEFECT_DELAY:
            q(f"UPDATE `{T_RES}` SET quality_defect = {PH}, "
              f"measured_at = COALESCE(measured_at, {PH}) WHERE lot_id = {PH}",
              (int(dec(it["d"])), now_str(), it["lot_id"]))
            q(f"{IGNORE} INTO `{T_RES}` (seq, lot_id, quality_defect, measured_at) "
              f"VALUES ({PH}, {PH}, {PH}, {PH})", (int(k), it["lot_id"], int(dec(it["d"])), now_str()))
            print(f"[실측 도착] {it['lot_id']} 불량판정={dec(it['d'])}")
            del it["d"]
        if "r" in it and age >= RESIDUAL_DELAY:
            q(f"UPDATE `{T_RES}` SET residual_li = {PH}, measured_at = {PH} WHERE lot_id = {PH}",
              (float(dec(it["r"])), now_str(), it["lot_id"]))
            print(f"[실측 도착] {it['lot_id']} 잔류리튬={dec(it['r'])}ppm")
            del it["r"]
        if "d" not in it and "r" not in it:
            done.append(k)
    for k in done:
        del state[k]


def main():
    state = load_state()
    existing = max_seq()
    if existing is None:
        for i in range(BACKFILL):
            produce(10000 + i, time.time() - (BACKFILL - i) * INTERVAL * 60 / SPEED, state)
        base = 10000 + BACKFILL - 1
    else:
        base = int(existing)
    if not SIMPLE:
        save_state(state)
    anchor = time.time()
    tick = max(1.0, INTERVAL * 60 / SPEED / 10)
    mode = "lots.id/timestamp" if APP_LOTS else f"{T_LOTS}.seq"
    print(f"가상 공장 가동 — {mode} → {T_RES} · {INTERVAL / SPEED * 60:.1f}초마다 LOT 1개 (Ctrl+C로 정지)")
    while True:
        target = base + int((time.time() - anchor) * SPEED / 60.0 // INTERVAL)
        cur = max_seq()
        cur_max = int(cur) if cur is not None else base
        for seq in range(cur_max + 1, target + 1):
            produce(seq, time.time(), state)
        if not SIMPLE:
            deliver(state)
            save_state(state)
        time.sleep(tick)


if __name__ == "__main__":
    main()
