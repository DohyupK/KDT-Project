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
    
    # Let's count bias runs (8 consecutive on one side of mean)
    bias_runs = 0
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
        if consec_above == 8 or consec_below == 8:
            bias_runs += 1
            
    # Let's count trend runs (6 consecutive increasing/decreasing)
    trend_runs = 0
    consec_inc = 0
    consec_dec = 0
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
        if consec_inc == 5 or consec_dec == 5:
            trend_runs += 1
            
    print(f"{col}: OOC_I={ooc_I}, OOC_MR={ooc_MR}, bias_runs={bias_runs}, trend_runs={trend_runs}, p_mean={p_mean:.6f}, p_var={p_var:.6f}")
