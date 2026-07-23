from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
import pymysql
from dotenv import load_dotenv
from pymysql.connections import Connection


# ---------------------------------------------------------
# 1. 경로 설정
# ---------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
DATABASE_DIR = SCRIPT_DIR.parent
DATA_DIR = DATABASE_DIR / "data"
ENV_PATH = DATABASE_DIR / ".env"

CLF_CSV_PATH = DATA_DIR / "cathode_clf_data.csv"
REG_CSV_PATH = DATA_DIR / "cathode_reg_data.csv"
TS_CSV_PATH = DATA_DIR / "cathode_ts_data.csv"


# ---------------------------------------------------------
# 2. 환경변수 로드
# ---------------------------------------------------------

load_dotenv(ENV_PATH)


def get_db_connection() -> Connection:
    """MariaDB 연결 객체를 생성한다."""

    required_env = [
        "DB_HOST",
        "DB_PORT",
        "DB_USER",
        "DB_PASSWORD",
        "DB_NAME",
    ]

    missing_env = [name for name in required_env if os.getenv(name) is None]

    if missing_env:
        raise RuntimeError(
            f".env 설정이 누락되었습니다: {', '.join(missing_env)}"
        )

    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


# ---------------------------------------------------------
# 3. 공통 변환 함수
# ---------------------------------------------------------

def to_none(value: Any) -> Any:
    """
    pandas의 NaN, NaT 값을 MariaDB에서 사용할 수 있는 None으로 변환한다.
    """

    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()

    return value


def read_csv_checked(
    file_path: Path,
    required_columns: list[str],
) -> pd.DataFrame:
    """CSV 존재 여부와 필수 컬럼을 검사한 뒤 읽는다."""

    if not file_path.exists():
        raise FileNotFoundError(
            f"CSV 파일을 찾을 수 없습니다: {file_path}"
        )

    dataframe = pd.read_csv(file_path)

    dataframe.columns = [
        str(column).strip()
        for column in dataframe.columns
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"{file_path.name}에 필수 컬럼이 없습니다: "
            f"{', '.join(missing_columns)}"
        )

    return dataframe


# ---------------------------------------------------------
# 4. 분류 CSV 적재
# ---------------------------------------------------------

def import_classification_data(connection: Connection) -> int:
    """
    분류 CSV를 cathode_quality_data에 저장한다.

    동일한 lot_id가 이미 있으면 기존 데이터를 갱신한다.
    """

    required_columns = [
        "id",
        "timestamp",
        "d50",
        "d90",
        "metal_impurity",
        "lithium_input",
        "additive_ratio",
        "process_time",
        "sintering_temp",
        "humidity",
        "tank_pressure",
        "operator_id",
        "quality_defect",
    ]

    dataframe = read_csv_checked(
        CLF_CSV_PATH,
        required_columns,
    )

    dataframe["timestamp"] = pd.to_datetime(
        dataframe["timestamp"],
        errors="coerce",
    )

    sql = """
    INSERT INTO cathode_classification_data (
        lot_id,
        post_sintering_at,
        operator_id,
        d50,
        d90,
        metal_impurity,
        lithium_input,
        additive_ratio,
        process_time,
        sintering_temp,
        humidity,
        tank_pressure,
        quality_defect
    )
    VALUES (
        %(lot_id)s,
        %(post_sintering_at)s,
        %(operator_id)s,
        %(d50)s,
        %(d90)s,
        %(metal_impurity)s,
        %(lithium_input)s,
        %(additive_ratio)s,
        %(process_time)s,
        %(sintering_temp)s,
        %(humidity)s,
        %(tank_pressure)s,
        %(quality_defect)s
    )
    ON DUPLICATE KEY UPDATE
        post_sintering_at = VALUES(post_sintering_at),
        operator_id = VALUES(operator_id),
        d50 = VALUES(d50),
        d90 = VALUES(d90),
        metal_impurity = VALUES(metal_impurity),
        lithium_input = VALUES(lithium_input),
        additive_ratio = VALUES(additive_ratio),
        process_time = VALUES(process_time),
        sintering_temp = VALUES(sintering_temp),
        humidity = VALUES(humidity),
        tank_pressure = VALUES(tank_pressure),
        quality_defect = VALUES(quality_defect),
        updated_at = CURRENT_TIMESTAMP
"""

    imported_count = 0

    with connection.cursor() as cursor:
        for _, row in dataframe.iterrows():
            if pd.isna(row["id"]):
                continue

            if pd.isna(row["timestamp"]):
                print(
                    f"[분류 건너뜀] 날짜 변환 실패: {row['id']}"
                )
                continue

            params = {
                "lot_id": str(row["id"]).strip(),
                "post_sintering_at": to_none(row["timestamp"]),
                "operator_id": (
                    None
                    if pd.isna(row["operator_id"])
                    else str(row["operator_id"]).strip()
                ),
                "d50": to_none(row["d50"]),
                "d90": to_none(row["d90"]),
                "metal_impurity": to_none(
                    row["metal_impurity"]
                ),
                "lithium_input": to_none(
                    row["lithium_input"]
                ),
                "additive_ratio": to_none(
                    row["additive_ratio"]
                ),
                "process_time": to_none(
                    row["process_time"]
                ),
                "sintering_temp": to_none(
                    row["sintering_temp"]
                ),
                "humidity": to_none(row["humidity"]),
                "tank_pressure": to_none(
                    row["tank_pressure"]
                ),
                "quality_defect": (
                    None
                    if pd.isna(row["quality_defect"])
                    else int(row["quality_defect"])
                ),
            }

            cursor.execute(sql, params)
            imported_count += 1

    return imported_count


# ---------------------------------------------------------
# 5. 회귀 CSV 적재
# ---------------------------------------------------------

def import_regression_data(connection: Connection) -> int:
    """
    회귀 CSV를 cathode_quality_data에 저장한다.

    분류 CSV와 동일 LOT라면 같은 행의 capacity를 갱신한다.
    분류 CSV에 없는 LOT라면 새로운 행으로 등록한다.
    """

    required_columns = [
        "id",
        "timestamp",
        "d50",
        "d90",
        "metal_impurity",
        "lithium_input",
        "additive_ratio",
        "process_time",
        "sintering_temp",
        "humidity",
        "tank_pressure",
        "operator_id",
        "capacity",
    ]

    dataframe = read_csv_checked(
        REG_CSV_PATH,
        required_columns,
    )

    dataframe["timestamp"] = pd.to_datetime(
        dataframe["timestamp"],
        errors="coerce",
    )

    sql = """
    INSERT INTO cathode_regression_data (
        lot_id,
        post_sintering_at,
        operator_id,
        d50,
        d90,
        metal_impurity,
        lithium_input,
        additive_ratio,
        process_time,
        sintering_temp,
        humidity,
        tank_pressure,
        capacity
    )
    VALUES (
        %(lot_id)s,
        %(post_sintering_at)s,
        %(operator_id)s,
        %(d50)s,
        %(d90)s,
        %(metal_impurity)s,
        %(lithium_input)s,
        %(additive_ratio)s,
        %(process_time)s,
        %(sintering_temp)s,
        %(humidity)s,
        %(tank_pressure)s,
        %(capacity)s
    )
    ON DUPLICATE KEY UPDATE
        post_sintering_at = VALUES(post_sintering_at),
        operator_id = VALUES(operator_id),
        d50 = VALUES(d50),
        d90 = VALUES(d90),
        metal_impurity = VALUES(metal_impurity),
        lithium_input = VALUES(lithium_input),
        additive_ratio = VALUES(additive_ratio),
        process_time = VALUES(process_time),
        sintering_temp = VALUES(sintering_temp),
        humidity = VALUES(humidity),
        tank_pressure = VALUES(tank_pressure),
        capacity = VALUES(capacity),
        updated_at = CURRENT_TIMESTAMP
"""

    imported_count = 0

    with connection.cursor() as cursor:
        for _, row in dataframe.iterrows():
            if pd.isna(row["id"]):
                continue

            if pd.isna(row["timestamp"]):
                print(
                    f"[회귀 건너뜀] 날짜 변환 실패: {row['id']}"
                )
                continue

            params = {
                "lot_id": str(row["id"]).strip(),
                "post_sintering_at": to_none(row["timestamp"]),
                "operator_id": (
                    None
                    if pd.isna(row["operator_id"])
                    else str(row["operator_id"]).strip()
                ),
                "d50": to_none(row["d50"]),
                "d90": to_none(row["d90"]),
                "metal_impurity": to_none(
                    row["metal_impurity"]
                ),
                "lithium_input": to_none(
                    row["lithium_input"]
                ),
                "additive_ratio": to_none(
                    row["additive_ratio"]
                ),
                "process_time": to_none(
                    row["process_time"]
                ),
                "sintering_temp": to_none(
                    row["sintering_temp"]
                ),
                "humidity": to_none(row["humidity"]),
                "tank_pressure": to_none(
                    row["tank_pressure"]
                ),
                "capacity": to_none(row["capacity"]),
            }

            cursor.execute(sql, params)
            imported_count += 1

    return imported_count


# ---------------------------------------------------------
# 6. 시계열 CSV 적재
# ---------------------------------------------------------

def import_time_series_data(
    connection: Connection,
    last_actual_date: date | None,
) -> int:
    """
    일별 불량률 CSV를 daily_defect_rates에 저장한다.

    last_actual_date 이하: ACTUAL
    last_actual_date 초과: PREDICTED

    기준일이 없으면 모든 데이터를 PREDICTED로 저장하지 않고
    오류를 발생시켜 잘못된 적재를 방지한다.
    """

    if last_actual_date is None:
        raise ValueError(
            "시계열 데이터의 실제값 종료일이 지정되지 않았습니다."
        )

    required_columns = [
        "timestamp",
        "daily_defect_rate",
    ]

    dataframe = read_csv_checked(
        TS_CSV_PATH,
        required_columns,
    )

    dataframe["timestamp"] = pd.to_datetime(
        dataframe["timestamp"],
        errors="coerce",
    )

    sql = """
        INSERT INTO daily_defect_rates (
            record_date,
            rate_type,
            daily_defect_rate,
            source_type
        )
        VALUES (
            %(record_date)s,
            %(rate_type)s,
            %(daily_defect_rate)s,
            %(source_type)s
        )
        ON DUPLICATE KEY UPDATE
            daily_defect_rate =
                VALUES(daily_defect_rate),
            source_type =
                VALUES(source_type),
            updated_at =
                CURRENT_TIMESTAMP
    """

    imported_count = 0

    with connection.cursor() as cursor:
        for _, row in dataframe.iterrows():
            timestamp = row["timestamp"]

            if pd.isna(timestamp):
                print("[시계열 건너뜀] 날짜 변환 실패")
                continue

            if pd.isna(row["daily_defect_rate"]):
                print(
                    f"[시계열 건너뜀] 불량률 없음: {timestamp}"
                )
                continue

            record_date = timestamp.date()

            if record_date <= last_actual_date:
                rate_type = "ACTUAL"
                source_type = "CSV"
            else:
                rate_type = "PREDICTED"
                source_type = "MODEL"

            params = {
                "record_date": record_date,
                "rate_type": rate_type,
                "daily_defect_rate": float(
                    row["daily_defect_rate"]
                ),
                "source_type": source_type,
            }

            cursor.execute(sql, params)
            imported_count += 1

    return imported_count


# ---------------------------------------------------------
# 7. 적재 결과 확인
# ---------------------------------------------------------

def print_import_summary(connection: Connection) -> None:
    """분류·회귀·시계열 데이터 적재 결과를 출력한다."""

    with connection.cursor() as cursor:
        # 분류 데이터 건수와 결측치 확인
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_rows,
                SUM(d50 IS NULL) AS d50_null,
                SUM(d90 IS NULL) AS d90_null,
                SUM(metal_impurity IS NULL)
                    AS metal_impurity_null,
                SUM(lithium_input IS NULL)
                    AS lithium_input_null,
                SUM(additive_ratio IS NULL)
                    AS additive_ratio_null,
                SUM(process_time IS NULL)
                    AS process_time_null,
                SUM(sintering_temp IS NULL)
                    AS sintering_temp_null,
                SUM(humidity IS NULL)
                    AS humidity_null,
                SUM(tank_pressure IS NULL)
                    AS tank_pressure_null
            FROM cathode_classification_data
            """
        )

        classification_summary = cursor.fetchone()

        # 회귀 데이터 건수와 결측치 확인
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_rows,
                SUM(d50 IS NULL) AS d50_null,
                SUM(d90 IS NULL) AS d90_null,
                SUM(metal_impurity IS NULL)
                    AS metal_impurity_null,
                SUM(lithium_input IS NULL)
                    AS lithium_input_null,
                SUM(additive_ratio IS NULL)
                    AS additive_ratio_null,
                SUM(process_time IS NULL)
                    AS process_time_null,
                SUM(sintering_temp IS NULL)
                    AS sintering_temp_null,
                SUM(humidity IS NULL)
                    AS humidity_null,
                SUM(tank_pressure IS NULL)
                    AS tank_pressure_null
            FROM cathode_regression_data
            """
        )

        regression_summary = cursor.fetchone()

        # 시계열 데이터 건수와 날짜 범위 확인
        cursor.execute(
            """
            SELECT
                rate_type,
                COUNT(*) AS row_count,
                MIN(record_date) AS min_date,
                MAX(record_date) AS max_date
            FROM daily_defect_rates
            GROUP BY rate_type
            ORDER BY rate_type
            """
        )

        time_series_summary = cursor.fetchall()

    print("\n===== 분류 데이터 적재 결과 =====")
    print(
        f"전체 행: "
        f"{classification_summary['total_rows'] or 0}"
    )
    print(
        f"d50 결측치: "
        f"{classification_summary['d50_null'] or 0}"
    )
    print(
        f"d90 결측치: "
        f"{classification_summary['d90_null'] or 0}"
    )
    print(
        f"metal_impurity 결측치: "
        f"{classification_summary['metal_impurity_null'] or 0}"
    )
    print(
        f"lithium_input 결측치: "
        f"{classification_summary['lithium_input_null'] or 0}"
    )
    print(
        f"additive_ratio 결측치: "
        f"{classification_summary['additive_ratio_null'] or 0}"
    )
    print(
        f"process_time 결측치: "
        f"{classification_summary['process_time_null'] or 0}"
    )
    print(
        f"sintering_temp 결측치: "
        f"{classification_summary['sintering_temp_null'] or 0}"
    )
    print(
        f"humidity 결측치: "
        f"{classification_summary['humidity_null'] or 0}"
    )
    print(
        f"tank_pressure 결측치: "
        f"{classification_summary['tank_pressure_null'] or 0}"
    )

    print("\n===== 회귀 데이터 적재 결과 =====")
    print(
        f"전체 행: "
        f"{regression_summary['total_rows'] or 0}"
    )
    print(
        f"d50 결측치: "
        f"{regression_summary['d50_null'] or 0}"
    )
    print(
        f"d90 결측치: "
        f"{regression_summary['d90_null'] or 0}"
    )
    print(
        f"metal_impurity 결측치: "
        f"{regression_summary['metal_impurity_null'] or 0}"
    )
    print(
        f"lithium_input 결측치: "
        f"{regression_summary['lithium_input_null'] or 0}"
    )
    print(
        f"additive_ratio 결측치: "
        f"{regression_summary['additive_ratio_null'] or 0}"
    )
    print(
        f"process_time 결측치: "
        f"{regression_summary['process_time_null'] or 0}"
    )
    print(
        f"sintering_temp 결측치: "
        f"{regression_summary['sintering_temp_null'] or 0}"
    )
    print(
        f"humidity 결측치: "
        f"{regression_summary['humidity_null'] or 0}"
    )
    print(
        f"tank_pressure 결측치: "
        f"{regression_summary['tank_pressure_null'] or 0}"
    )

    print("\n===== 일별 불량률 적재 결과 =====")

    if not time_series_summary:
        print("저장된 일별 불량률 데이터가 없습니다.")
    else:
        for result in time_series_summary:
            print(
                f"{result['rate_type']}: "
                f"{result['row_count']}건, "
                f"{result['min_date']} ~ "
                f"{result['max_date']}"
            )


# ---------------------------------------------------------
# 8. 메인 실행
# ---------------------------------------------------------

def main() -> None:
    connection: Connection | None = None

    LAST_ACTUAL_DATE = date(2025, 12, 31)

    try:
        connection = get_db_connection()

        print("MariaDB 연결 성공")

        classification_count = import_classification_data(
            connection
        )
        print(
            f"분류 CSV 처리 완료: "
            f"{classification_count}건"
        )

        regression_count = import_regression_data(
            connection
        )
        print(
            f"회귀 CSV 처리 완료: "
            f"{regression_count}건"
        )

        time_series_count = import_time_series_data(
            connection,
            LAST_ACTUAL_DATE,
        )
        print(
            f"시계열 CSV 처리 완료: "
            f"{time_series_count}건"
        )

        connection.commit()

        print("\n전체 트랜잭션 저장 완료")

        print_import_summary(connection)

    except Exception as error:
        if connection is not None:
            connection.rollback()

        print("\nCSV 적재 실패")
        print(f"오류 내용: {error}")

        sys.exit(1)

    finally:
        if connection is not None:
            connection.close()
            print("\nMariaDB 연결 종료")


if __name__ == "__main__":
    main()