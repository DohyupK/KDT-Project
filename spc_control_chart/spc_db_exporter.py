# -*- coding: utf-8 -*-
"""
SPC Database Exporter
====================
This script cleans the cathode_clf_data.csv file by removing missing values,
calculates the SPC Phase I control limits for all 9 process parameters,
saves the limits in the database, and creates the SPC view.

The operational `lots` table is intentionally read-only here because issues and
handover records reference it. Raw CSV loading is handled by the backend
cathode-source importer.
"""

import os
import pymysql
import pandas as pd
import numpy as np
from dotenv import load_dotenv

# ── 1. DB 환경 변수 로드 ──────────────────────────────────────
ENV_PATH = r"C:\Projects\KDT-Project\backend\.env"
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
else:
    raise FileNotFoundError(f"Backend environment file not found at {ENV_PATH}")

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "kdt_project")

DATA_PATH = r"C:\Projects\KDT-Project\ai-service\data\cathode_clf_data.csv"
CLEAN_DATA_PATH = r"C:\Projects\KDT-Project\ai-service\data\cathode_clf_data_clean.csv"

print(f"Connecting to database: {DB_HOST}:{DB_PORT} / DB: {DB_NAME}")

# ── 2. 데이터 로드 및 결측치 처리 (제거: dropna) ──────────────────
df = pd.read_csv(DATA_PATH)
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.sort_values('timestamp').reset_index(drop=True)

exclude_cols = ['id', 'timestamp', 'operator_id', 'quality_defect']
target_cols = [col for col in df.columns if col not in exclude_cols]

print(f"Original dataset: {len(df)} rows")
print("Missing values per column before cleaning:")
print(df[target_cols].isnull().sum())

# 결측치가 하나라도 있는 행을 제거 (dropna)
df = df.dropna(subset=target_cols).reset_index(drop=True)

print("\nMissing values per column after dropna:")
print(df[target_cols].isnull().sum())
print(f"Cleaned dataset: {len(df)} rows")

# 전처리 데이터 저장
df.to_csv(CLEAN_DATA_PATH, index=False)
print(f"Cleaned dataset saved to: {CLEAN_DATA_PATH}")

# ── 3. I-MR 관리 한계치 계산 (Phase I: 초기 2000 LOT) ───────────
PHASE1_LEN = 2000
df_phase1 = df.iloc[:PHASE1_LEN]

control_limits = {}
d2 = 1.128
D4 = 3.267

for col in target_cols:
    x = df_phase1[col].values
    mu = np.mean(x)
    mr = np.abs(np.diff(x))
    mean_mr = np.mean(mr)
    
    UCL_I = mu + 3 * (mean_mr / d2)
    LCL_I = mu - 3 * (mean_mr / d2)
    
    UCL_MR = D4 * mean_mr
    
    control_limits[col] = {
        'cl': mu,
        'ucl': UCL_I,
        'lcl': LCL_I,
        'cl_mr': mean_mr,
        'ucl_mr': UCL_MR
    }

# ── 4. MariaDB 연결 및 스키마/데이터 적재 ─────────────────────────
conn = pymysql.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    autocommit=True
)

try:
    with conn.cursor() as cur:
        # A. control_bounds 테이블 생성
        print("\nCreating 'control_bounds' table if not exists...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS control_bounds (
                parameter_name VARCHAR(64) PRIMARY KEY,
                cl DOUBLE NOT NULL,
                ucl DOUBLE NOT NULL,
                lcl DOUBLE NOT NULL,
                cl_mr DOUBLE NOT NULL,
                ucl_mr DOUBLE NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        """)
        
        # B. control_bounds 데이터 적재 (UPSERT)
        print("Upserting calculated control limits into database...")
        for param, lim in control_limits.items():
            cur.execute("""
                INSERT INTO control_bounds (parameter_name, cl, ucl, lcl, cl_mr, ucl_mr)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    cl = VALUES(cl),
                    ucl = VALUES(ucl),
                    lcl = VALUES(lcl),
                    cl_mr = VALUES(cl_mr),
                    ucl_mr = VALUES(ucl_mr);
            """, (param, lim['cl'], lim['ucl'], lim['lcl'], lim['cl_mr'], lim['ucl_mr']))
            
        print("Control limits loaded successfully.")

        # C. 운영 lots 보호
        # issues/handover_history가 lots를 FK로 참조하므로 이 스크립트에서는
        # TRUNCATE/INSERT/UPDATE를 수행하지 않는다.
        print("\nSkipping operational 'lots' writes (protected table).")

        # D. 아파치 슈퍼셋(Apache Superset) 연동 편의를 위한 뷰(SQL View) 생성
        print("\nCreating Unified SPC View for Apache Superset / ECharts...")
        cur.execute("""
            CREATE OR REPLACE VIEW v_spc_charts AS
            SELECT 
              l.lot_id,
              l.recorded_at,
              l.d50,
              b_d50.cl AS d50_cl, b_d50.ucl AS d50_ucl, b_d50.lcl AS d50_lcl,
              l.d90,
              b_d90.cl AS d90_cl, b_d90.ucl AS d90_ucl, b_d90.lcl AS d90_lcl,
              l.metal_impurity,
              b_mi.cl AS metal_impurity_cl, b_mi.ucl AS metal_impurity_ucl, b_mi.lcl AS metal_impurity_lcl,
              l.lithium_input,
              b_li.cl AS lithium_input_cl, b_li.ucl AS lithium_input_ucl, b_li.lcl AS lithium_input_lcl,
              l.additive_ratio,
              b_ar.cl AS additive_ratio_cl, b_ar.ucl AS additive_ratio_ucl, b_ar.lcl AS additive_ratio_lcl,
              l.process_time,
              b_pt.cl AS process_time_cl, b_pt.ucl AS process_time_ucl, b_pt.lcl AS process_time_lcl,
              l.sintering_temp,
              b_st.cl AS sintering_temp_cl, b_st.ucl AS sintering_temp_ucl, b_st.lcl AS sintering_temp_lcl,
              l.humidity,
              b_hu.cl AS humidity_cl, b_hu.ucl AS humidity_ucl, b_hu.lcl AS humidity_lcl,
              l.tank_pressure,
              b_tp.cl AS tank_pressure_cl, b_tp.ucl AS tank_pressure_ucl, b_tp.lcl AS tank_pressure_lcl
            FROM lots l
            LEFT JOIN control_bounds b_d50 ON b_d50.parameter_name = 'd50'
            LEFT JOIN control_bounds b_d90 ON b_d90.parameter_name = 'd90'
            LEFT JOIN control_bounds b_mi ON b_mi.parameter_name = 'metal_impurity'
            LEFT JOIN control_bounds b_li ON b_li.parameter_name = 'lithium_input'
            LEFT JOIN control_bounds b_ar ON b_ar.parameter_name = 'additive_ratio'
            LEFT JOIN control_bounds b_pt ON b_pt.parameter_name = 'process_time'
            LEFT JOIN control_bounds b_st ON b_st.parameter_name = 'sintering_temp'
            LEFT JOIN control_bounds b_hu ON b_hu.parameter_name = 'humidity'
            LEFT JOIN control_bounds b_tp ON b_tp.parameter_name = 'tank_pressure';
        """)
        print("View 'v_spc_charts' created successfully.")

finally:
    conn.close()
    print("\nDatabase connection closed.")
