# -*- coding: utf-8 -*-
"""
Advanced SPC Control Chart Analysis - All Parameters
======================================================
This script performs a rigorous SPC Phase I stability check on all process parameters in cathode_clf_data.csv.
It implements the 1-6 analysis steps requested by the user.
"""

import os
import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt

# 1. Load Data
DATA_PATH = r"C:\Projects\KDT-Project\ai-service\data\cathode_clf_data.csv"
SAVE_DIR = r"C:\Projects\KDT-Project\spc_control_chart"

if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(f"Data file not found at {DATA_PATH}")
os.makedirs(SAVE_DIR, exist_ok=True)

# ── 1) 전체 데이터를 timestamp 순으로 정렬 ──────────────────
df = pd.read_csv(DATA_PATH)
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.sort_values('timestamp').reset_index(drop=True)

# ── 2) 초기 2,000 LOT를 Phase I 후보 구간으로 설정 ────────────
PHASE1_LEN = 2000
df_phase1 = df.iloc[:PHASE1_LEN].copy()

# 파라미터 자동 선택 (LOT ID, timestamp, operator_id, quality_defect 제외)
exclude_cols = ['id', 'timestamp', 'operator_id', 'quality_defect']
target_cols = [col for col in df.columns if col not in exclude_cols]

col_mapping = {
    'd50': '입도(d50)',
    'd90': '입도(d90)',
    'metal_impurity': '금속이물(metal_impurity)',
    'lithium_input': '리튬투입량(lithium_input)',
    'additive_ratio': '첨가제비율(additive_ratio)',
    'process_time': '공정시간(process_time)',
    'sintering_temp': '소성온도(sintering_temp)',
    'humidity': '습도(humidity)',
    'tank_pressure': '탱크압력(tank_pressure)'
}

summary_rows = []
final_limits = {}

print("=== Phase I SPC 분석 시작 (총 9개 공정 파라미터) ===")

for col in target_cols:
    name = col_mapping.get(col, col)
    x = df_phase1[col].dropna().values
    n = len(x)
    if n < 2:
        continue
    
    # ── 3) I-MR 관리도 파라미터 계산 ─────────────────────────
    # 개별값 (I) 관리도 한계 계산
    mu = np.mean(x)
    mr = np.abs(np.diff(x))
    mean_mr = np.mean(mr)
    
    d2 = 1.128
    D4 = 3.267
    
    UCL_I = mu + 3 * (mean_mr / d2)
    LCL_I = mu - 3 * (mean_mr / d2)
    
    # 이동범위 (MR) 관리도 한계 계산
    UCL_MR = D4 * mean_mr
    LCL_MR = 0.0
    
    # ── 4) 이상 요인 (OOC) 및 Nelson Rules 검사 ──────────────────
    # A. I 관리도 UCL/LCL 초과점 수
    ooc_I = np.sum((x > UCL_I) | (x < LCL_I))
    
    # B. MR 관리도 UCL 초과점 수
    ooc_MR = np.sum(mr > UCL_MR)
    
    # C. 8점 연속 한쪽 편중 (Bias) 검사 (Nelson Rule 2)
    bias_found = False
    consec_above = 0
    consec_below = 0
    for val in x:
        if val > mu:
            consec_above += 1
            consec_below = 0
        elif val < mu:
            consec_below += 1
            consec_above = 0
        else:
            consec_above = 0
            consec_below = 0
        
        if consec_above >= 8 or consec_below >= 8:
            bias_found = True
            break
            
    # D. 6점 연속 상승·하락 (Trend) 검사 (Nelson Rule 3)
    consec_inc = 0
    consec_dec = 0
    inc_trend_found = False
    dec_trend_found = False
    
    for i in range(1, len(x)):
        if x[i] > x[i-1]:
            consec_inc += 1
            consec_dec = 0
        elif x[i] < x[i-1]:
            consec_dec += 1
            consec_inc = 0
        else:
            consec_inc = 0
            consec_dec = 0
            
        if consec_inc >= 5:
            inc_trend_found = True
        if consec_dec >= 5:
            dec_trend_found = True

    if inc_trend_found and dec_trend_found:
        trend_str = "상승/하락"
    elif inc_trend_found:
        trend_str = "상승"
    elif dec_trend_found:
        trend_str = "하락"
    else:
        trend_str = "없음"

    # E. 전반부·후반부 평균과 변동 차이 검정
    half = n // 2
    x1, x2 = x[:half], x[half:]
    
    # 평균 차이 (t-test)
    t_stat, p_mean = stats.ttest_ind(x1, x2, equal_var=False)
    # 변동 차이 (Levene test)
    _, p_var = stats.levene(x1, x2)
    
    # 판정 기준 정립
    bias_str = "있음" if bias_found else "없음"
    
    # MR 안정성 판정 (MR 이탈점 비율이 2% 이하이고, Levene 검정 결과 변동 차이가 유의미하지 않음(p_var >= 0.05))
    mr_ooc_rate = ooc_MR / (n - 1)
    if mr_ooc_rate <= 0.02 and p_var >= 0.05:
        mr_stable_str = "안정"
    else:
        mr_stable_str = "불안정"
        
    # ── 5) 파라미터별 판정 및 6) 관리한계 확정 여부 결정 ──
    # 엄격한 Nelson Rules 기준 적용 시 2000개의 데이터셋에서는 우연히라도 트렌드/편향이 감지될 수 있으나,
    # 장기적인 공정 이동(Mean shift)과 변동 차이를 종합적으로 고려합니다.
    # 최종 판단: I-chart 이탈점 수 <= 5개 이고, 추세가 없으며, 편중이 없고, MR이 안정적인 경우에만 '사용 가능'
    if ooc_I <= 5 and trend_str == "없음" and bias_str == "없음" and mr_stable_str == "안정":
        final_decision = "사용 가능"
        final_limits[col] = {
            'CL': mu,
            'UCL': UCL_I,
            'LCL': LCL_I,
            'CL_MR': mean_mr,
            'UCL_MR': UCL_MR
        }
    else:
        final_decision = "재검토"
        
    summary_rows.append({
        'key': col,
        '파라미터': name,
        '이탈점 수': ooc_I,
        '추세': trend_str,
        '편중': bias_str,
        'MR 안정': mr_stable_str,
        '최종 판단': final_decision,
        'p_mean': p_mean,
        'p_var': p_var
    })
    
    # ── I-MR 차트 시각화 및 저장 ────────────────────────────
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), sharex=True)
    
    # I 차트
    ax1.plot(x, color='blue', lw=0.7, marker='.', ms=2, alpha=0.6, label='Individual Value (I)')
    ax1.axhline(mu, color='green', ls='-', label=f'CL ({mu:.4f})')
    ax1.axhline(UCL_I, color='red', ls='--', label=f'UCL ({UCL_I:.4f})')
    ax1.axhline(LCL_I, color='red', ls='--', label=f'LCL ({LCL_I:.4f})')
    
    viol_I = np.where((x > UCL_I) | (x < LCL_I))[0]
    ax1.scatter(viol_I, x[viol_I], color='red', zorder=5, s=15, label=f'OOC ({len(viol_I)} pts)')
    
    ax1.set_title(f'I Chart - {name}')
    ax1.legend(loc='upper right')
    ax1.grid(True, alpha=0.3)
    
    # MR 차트
    ax2.plot(mr, color='purple', lw=0.7, marker='.', ms=2, alpha=0.6, label='Moving Range (MR)')
    ax2.axhline(mean_mr, color='green', ls='-', label=f'CL ({mean_mr:.4f})')
    ax2.axhline(UCL_MR, color='red', ls='--', label=f'UCL ({UCL_MR:.4f})')
    
    viol_MR = np.where(mr > UCL_MR)[0]
    ax2.scatter(viol_MR, mr[viol_MR], color='red', zorder=5, s=15, label=f'OOC ({len(viol_MR)} pts)')
    
    ax2.set_title(f'MR Chart - {name}')
    ax2.legend(loc='upper right')
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    chart_path = os.path.join(SAVE_DIR, f"spc_imr_{col}.png")
    plt.savefig(chart_path, dpi=150)
    plt.close()
    print(f"  - {name} 차트 저장 완료: {chart_path}")

# ── 5) 파라미터별 판정 결과 표 출력 및 리포트 파일 저장 ──────────────────────
report_path = os.path.join(SAVE_DIR, "spc_report.md")

with open(report_path, "w", encoding="utf-8") as f:
    f.write("# Phase I SPC 분석 결과 리포트 (전체 파라미터)\n\n")
    f.write("본 리포트는 초기 2,000 LOT의 Phase I 후보 구간 데이터를 바탕으로 공정의 안정성을 평가한 결과입니다.\n\n")
    
    f.write("## 1. 파라미터별 판정 결과 요약 표\n\n")
    headers = ['파라미터', '이탈점 수', '추세', '편중', 'MR 안정', '최종 판단']
    f.write(f"| {' | '.join(headers)} |\n")
    f.write(f"| {' | '.join(['---'] * len(headers))} |\n")
    
    for row in summary_rows:
        f.write(f"| {row['파라미터']} | {row['이탈점 수']} | {row['추세']} | {row['편중']} | {row['MR 안정']} | {row['최종 판단']} |\n")
    f.write("\n")
    
    f.write("## 2. [확정] 안정성 검증된 파라미터의 관리 한계 (Control Limits)\n\n")
    if len(final_limits) == 0:
        f.write("안정성이 검증되어 관리한계가 확정된 파라미터가 없습니다. (전부 재검토 필요)\n")
        f.write("\n> **참고**: 현업 분석 시에는 국소적인 8점 연속 편중이나 6점 연속 추세의 기준을 완화하거나(예: 전체 데이터의 일정 비율 이상 발생 시 적용), 전/후반부 통계 검정 결과만으로 장기 안정성을 판단하여 관리한계를 확정할 수 있습니다.\n")
    else:
        for col, limits in final_limits.items():
            name = col_mapping.get(col, col)
            f.write(f"### {name} ({col}) - 사용 가능 (관리한계 확정)\n")
            f.write(f"- **I 관리도 (Individual)**: CL = `{limits['CL']:.4f}`, UCL = `{limits['UCL']:.4f}`, LCL = `{limits['LCL']:.4f}`\n")
            f.write(f"- **MR 관리도 (Moving Range)**: CL = `{limits['CL_MR']:.4f}`, UCL = `{limits['UCL_MR']:.4f}`\n\n")

print(f"\n분석 결과 리포트가 저장되었습니다: {report_path}")
