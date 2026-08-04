# -*- coding: utf-8 -*-
"""
SPC 관리한계 계산·관리도 예시
================================================
[ 실행 전 채울 곳 — 딱 2군데, ★ 표시 ]

  1) DATA_PATH : cathode_clf_data.csv 파일이 있는 위치
  2) SAVE_DIR  : 차트 그림(png)을 저장할 폴더

경로 쓰는 법 (Windows):
  - 탐색기에서 파일 우클릭 → "경로 복사" 후 붙여넣기
  - 붙여넣은 그대로 쓰려면 따옴표 앞에 r을 붙일 것
    예) DATA_PATH = r"C:\\Users\\jihoon\\KDT-Project\\ai-service\\data\\cathode_clf_data.csv"
  - 또는 백슬래시(\\)를 슬래시(/)로 바꿔도 됨
    예) DATA_PATH = "C:/Users/jihoon/KDT-Project/ai-service/data/cathode_clf_data.csv"

실행 방법:
  1) 필요 패키지 설치(최초 1회):  pip install pandas matplotlib
  2) 실행:                        python spc_control_chart_배포용.py
"""
import os
import pandas as pd
import matplotlib.pyplot as plt

# ★ 1) 데이터 파일 경로 — 본인 PC의 cathode_clf_data.csv 위치를 넣으세요
DATA_PATH = r"C:\Projects\KDT-Project\ai-service\data\cathode_clf_data.csv"

# ★ 2) 차트 저장 폴더 — 그림을 저장할 폴더 경로를 넣으세요 (예: 바탕화면의 spc 폴더)
SAVE_DIR = r"C:\Users\sky_k\OneDrive\Desktop"

VAR = "d50"    # 관리도를 그릴 변수 (습도는 "humidity" 등으로 바꿔서 재실행)

# ── 0) 경로 확인 ─────────────────────────────────────────
if not DATA_PATH or not os.path.exists(DATA_PATH):
    raise SystemExit("★ DATA_PATH를 확인하세요 — csv 파일 경로가 비었거나 잘못됐습니다.")
if not SAVE_DIR:
    SAVE_DIR = "."        # 비워두면 스크립트 실행 위치에 저장
os.makedirs(SAVE_DIR, exist_ok=True)

df = pd.read_csv(DATA_PATH)

# ── 1) 안정 기준 구간에서 관리한계 계산 ──────────────────
base = df[VAR].iloc[:2000].dropna()      # 앞 2,000 LOT을 기준 구간으로
mu, sigma = base.mean(), base.std()
CL, UCL, LCL = mu, mu + 3*sigma, mu - 3*sigma
print(f"{VAR}:  CL={CL:.1f}  UCL={UCL:.1f}  LCL={LCL:.1f}")

# ── 2) 전체 구간에 적용해 관리한계 이탈(사건) 탐지 ────────
x = df[VAR].dropna()
ooc = x[(x > UCL) | (x < LCL)]
print(f"관리한계 이탈: {len(ooc)}건 / {len(x):,} LOT")
if len(ooc):
    print(ooc.head())                    # 이탈 LOT의 행 번호와 값

# ── 3) 관리도 그리기 (최근 200 LOT) ──────────────────────
w = x.iloc[-200:]
plt.figure(figsize=(12, 4))
plt.plot(w.index, w.values, lw=1, marker=".", ms=4)
plt.axhline(CL,  color="gray",            label=f"CL {CL:.1f}")
plt.axhline(UCL, color="red", ls="--",    label=f"UCL {UCL:.1f}")
plt.axhline(LCL, color="red", ls="--",    label=f"LCL {LCL:.1f}")
viol = w[(w > UCL) | (w < LCL)]
plt.scatter(viol.index, viol.values, color="red", zorder=3)
plt.legend(loc="upper right", fontsize=8)
plt.title(f"SPC Control Chart - {VAR}")
plt.tight_layout()
out = os.path.join(SAVE_DIR, f"spc_{VAR}.png")
plt.savefig(out, dpi=150)
print(f"차트 저장: {out}")
