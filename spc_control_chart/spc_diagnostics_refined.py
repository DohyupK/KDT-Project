import pandas as pd
import numpy as np
from scipy import stats

DATA_PATH = r"C:\Projects\KDT-Project\ai-service\data\cathode_clf_data.csv"
df = pd.read_csv(DATA_PATH)
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.sort_values('timestamp').reset_index(drop=True)
df_phase1 = df.iloc[:2000]

exclude_cols = ['id', 'timestamp', 'operator_id', 'quality_defect']
target_cols = [col for col in df.columns if col not in exclude_cols]

for col in target_cols:
    x = df_phase1[col].dropna().values
    n = len(x)
    mu = np.mean(x)
    mr = np.abs(np.diff(x))
    mean_mr = np.mean(mr)
    
    d2 = 1.128
    D4 = 3.267
    
    UCL_I = mu + 3 * (mean_mr / d2)
    LCL_I = mu - 3 * (mean_mr / d2)
    UCL_MR = D4 * mean_mr
    
    ooc_I = np.sum((x > UCL_I) | (x < LCL_I))
    ooc_MR = np.sum(mr > UCL_MR)
    
    half = n // 2
    x1, x2 = x[:half], x[half:]
    _, p_mean = stats.ttest_ind(x1, x2)
    _, p_var = stats.levene(x1, x2)
    
    # Linear regression slope p-value
    slope, intercept, r_value, p_slope, std_err = stats.linregress(np.arange(n), x)
    
    trend_str = "없음"
    if p_slope < 0.01 and abs(r_value) > 0.05:
        trend_str = "상승" if slope > 0 else "하락"
        
    bias_str = "있음" if p_mean < 0.01 else "없음"
    
    mr_ooc_rate = ooc_MR / (n - 1)
    mr_stable = "안정" if (p_var >= 0.01 and mr_ooc_rate < 0.03) else "불안정"
    
    decision = "사용 가능" if (ooc_I <= 10 and trend_str == "없음" and bias_str == "없음" and mr_stable == "안정") else "재검토"
    
    print(f"{col:<20} | OOC_I={ooc_I:<2} | trend={trend_str:<4} (p_slope={p_slope:.4f}, r={r_value:.4f}) | bias={bias_str:<3} (p_mean={p_mean:.4f}) | MR={mr_stable:<4} (p_var={p_var:.4f}, ooc_mr_rate={mr_ooc_rate:.4f}) | {decision}")
