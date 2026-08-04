import pandas as pd
import numpy as np
import scipy.stats as stats
import seaborn as sns
import matplotlib.pyplot as plt
import platform

# matplotlib 한글 폰트 설정 (Windows 기준)
if platform.system() == 'Windows':
    plt.rc('font', family='Malgun Gothic')
# 마이너스 기호 깨짐 방지
plt.rc('axes', unicode_minus=False)

# 1. 데이터 로드 및 결합 (예시)
# df_spc: SPC 상태 변수 포함, df_ai: 불량확률 및 잔여리튬 포함
# df = pd.merge(df_spc, df_ai, on='id')

# 임의의 예시 데이터 생성 (검증용)
np.random.seed(42)
n = 1000
residual_li = np.random.normal(3000, 800, n)
defect_prob = 1 / (1 + np.exp(-(residual_li - 4000)/500))  # 로지스틱 관계
is_spc_ooc = np.where((residual_li > 3800) | (np.random.rand(n) < 0.1), 1, 0)
quality_defect = np.where(defect_prob > 0.5, np.random.binomial(1, 0.9, n), np.random.binomial(1, 0.1, n))

df = pd.DataFrame({
    'residual_li': residual_li,
    'defect_prob': defect_prob,
    'is_spc_ooc': is_spc_ooc,
    'quality_defect': quality_defect
})

# --------------------------------------------------
# [분석 1] 잔여 리튬 vs AI 불량 확률 상관관계 (Pearson)
# --------------------------------------------------
pearson_r, p_val = stats.pearsonr(df['residual_li'], df['defect_prob'])
print(f"■ 잔여 리튬 & AI 불량 확률 상관 계수: {pearson_r:.4f} (p-value: {p_val:.4e})")

# --------------------------------------------------
# [분석 2] SPC 이탈 여부에 따른 잔여 리튬 분포 비교 (T-test)
# --------------------------------------------------
group_stable = df[df['is_spc_ooc'] == 0]['residual_li']
group_ooc = df[df['is_spc_ooc'] == 1]['residual_li']

t_stat, t_pval = stats.ttest_ind(group_stable, group_ooc, equal_var=False)
print(f"■ SPC 상태에 따른 잔여 리튬 차이 검정: t-value = {t_stat:.4f}, p-value = {t_pval:.4e}")

# --------------------------------------------------
# [분석 3] SPC 이탈 여부와 실제 불량의 카이제곱 검정 (Chi-Square)
# --------------------------------------------------
contingency_table = pd.crosstab(df['is_spc_ooc'], df['quality_defect'])
chi2, chi2_pval, _, _ = stats.chi2_contingency(contingency_table)
print(f"■ SPC 이탈 여부 & 실제 불량의 카이제곱 p-value: {chi2_pval:.4e}")

# --------------------------------------------------
# [시각화] 산점도 및 분포 확인
# --------------------------------------------------
plt.figure(figsize=(10, 5))
sns.scatterplot(data=df, x='residual_li', y='defect_prob', hue='is_spc_ooc', alpha=0.7)
plt.axvline(3500, color='red', linestyle='--', label='위험 임계 (3500 ppm)')
plt.axvline(5000, color='darkred', linestyle='-', label='불량 역전 (5000 ppm)')
plt.title("Correlation: Residual Lithium vs AI Defect Probability")
plt.xlabel("Residual Lithium (ppm)")
plt.ylabel("AI Defect Probability")
plt.legend()
plt.show()
