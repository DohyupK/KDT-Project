# 챗봇 담당 인수인계 (2026-08-04)

BE/DB 대시보드·LOT 채점 작업 범위에서 **AI 챗봇 코드는 수정하지 않았습니다.**  
아래는 챗봇 담당자 확인·선택 반영 요청입니다.

## 유지 요청 (깨지면 BE 배치 채점 영향)

- `fillThreshold` 필드명·의미
- `POST /predict`, `POST /predict-residual` 요청/응답 스키마
- clf / residual 학습 파이프라인 시그니처

BE는 위 엔드포인트를 **신규 소비자**로 사용합니다 (`backend/src/services/aiProxy.ts`).

## 선택·권장: 용어 통일

운영·대시보드 UI는 **잔류리튬**으로 통일했습니다. 챗봇 사용자 문구가 `잔여 리튬`이면 맞추는 것을 권장합니다.

- `ai-service/agent/api_llm/prompts.py`
- `ai-service/agent/api_llm/graph.py` (`_format_residual` 등)
- `docs/references/cathode-residual-schema.md` 표기

## 인지: risk_level 라벨 변경

`lots` / `issues`의 `risk_level`이 `높음|중간|낮음` → **`심각|주의|안정`** 으로 바뀝니다.  
Main「위험 LOT Top」안내·이슈 연동 문구가 옛 라벨을 쓰면 점검해 주세요.

## 인지: Feature Importance

- 대시보드 패널: clf SHAP **Top-5**
- 생산 상세 테이블 FI 컬럼 **고정 4개**: 금속 불순물, 소성온도 이탈, 습도, 온도×습도
- 챗봇 전역 SHAP **Top-4** 안내는 그대로 둬도 됩니다 (샘플별 원인 과장 금지 유지)

## 참고 API 문서

[`docs/references/issue-lot-api.md`](./issue-lot-api.md)
