# LOT 채점 운영 — AWS 앱 / 이 PC 워커

최종 갱신: 2026-08-18

채점(`/predict-voting` → `JUDGMENT_LOTS` / `ANALYSIS_LOTS`)은 **이 PC**가 한다. AWS는 SPC 미러와 이슈·메일만.

보안 챗과 **명령을 합치지 않는다.** 보안: [`aws-pc-security-worker.md`](./aws-pc-security-worker.md).

---

## 1. 한 줄

| 기계 | 명령 | 하는 일 | 하지 않는 일 |
|------|------|---------|--------------|
| AWS Lightsail | `npm run dev` | 프론트 · 백엔드 · 일반 챗 · `SPC_LOT`→`LOTS` · 이슈 INSERT · n8n 메일 | `/predict-voting` LOT 채점 |
| 이 PC | `npm run score-pc` | 로컬 `:8800` voting · 미채점 LOT → DB 기록 · 사유·권고조치 | Next/Express · 이슈 INSERT |

Lightsail `.env`: **`LOT_SCORE_ON_AWS=0`**. 로컬에서 앱과 채점을 한 프로세스에서 돌리면 이 값을 비우거나 `1`.

`npm run dev`가 채점 워커를 켜지 않는다. `npm run score-pc`가 프론트를 켜지 않는다.

---

## 2. 흐름

```text
피더 (이 PC plant_feeder_live.py) → AWS SPC_LOT
AWS backend spc-sync: SPC_LOT → LOTS (채점 없음)
이 PC score-pc
  → 미채점 LOT 집기
  → 로컬 http://127.0.0.1:8800/predict-voting
  → JUDGMENT_LOTS / ANALYSIS_LOTS / LOT_RESULTS
  → risk_reason · recommended_actions
AWS analysis-sync: ensureIssues + n8n (심각 행이 생긴 뒤)
```

---

## 3. 이 PC에서 켜기

프론트·백엔드는 켜지 않는다. vLLM은 **필수 아님** (없으면 사유는 룰 폴백).

```powershell
npm run score-pc -- -KeyPath "키.pem" -PublicHost "<Lightsail공인IP>"
```

- `:8800` `/health`가 없으면 스크립트가 로컬 uvicorn만 기동 (이 PC `ai-service/models/`)
- `ssh -L 3306` (이미 열려 있으면 스킵 — `security-pc`와 동시 가능)
- 이 PC `.env`는 터널 동안 `DB_HOST=127.0.0.1`

Ctrl+C: 워커 + (이 스크립트가 켠) uvicorn + ssh 정리.

환경 (시크릿 없음):

| 변수 | 기본 | 의미 |
|------|------|------|
| `LOT_SCORE_ON_AWS` | `1` | Lightsail은 `0` |
| `SCORE_PC_INTERVAL_MS` | `60000` | 워커 틱 |
| `SCORE_AI_URL` | `http://127.0.0.1:8800` | voting URL (`AI_SERVICE_URL` 덮어씀) |

---

## 4. AWS

```bash
cd ~/KDT-Project
# .env 에 LOT_SCORE_ON_AWS=0
npm run dev
```

backend를 재시작해야 채점 폴러가 꺼진다.
