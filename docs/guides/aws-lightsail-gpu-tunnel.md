# Lightsail 16GB 앱 서버 + 이 PC GPU 터널

최종 갱신: 2026-08-14  
확정 설계: **앱·DB·n8n·Qdrant는 AWS Lightsail CPU**, **보안 챗 요약(vLLM)은 이 PC GPU**를 SSH 역방향 터널로 붙인다.

GPU Lightsail/EC2를 사지 않는다. 첨부 매뉴얼의 「한 대 GPU에서 vLLM까지」는 이 설계가 아니다.

관련: [login-ubuntu-mariadb.md](./login-ubuntu-mariadb.md) · [vllm-setup.md](../references/vllm-setup.md) · 로컬 포트: [documents-watcher-qdrant.md](../references/documents-watcher-qdrant.md)

---

## 1. 한 줄 구성

```text
사용자 브라우저
  → http://<16GB공인IP>/     Nginx :80
      → 프론트 :3000
          → /api  백엔드 :3001
          → /ai   FastAPI :8800
      백엔드 → MariaDB 127.0.0.1:3306
      백엔드 → n8n     127.0.0.1:5678
      AI     → Qdrant  127.0.0.1:6333
      AI     → vLLM    127.0.0.1:8001   ← 이 PC GPU (ssh -R)

이 PC
  vLLM :8001
  ssh -R 8001:127.0.0.1:8001 ubuntu@<16GB공인IP>
```

인스턴스 이름 예: `my-server-16gb` (4 vCPU · 16GB RAM · 320GB SSD).  
구 `my-server`(2GB) 공인 IP는 코드에 박지 말고 루트 `.env`만 본다.

---

## 2. 서버를 바꾸면 손대는 곳 (비밀은 `.env`만)

| 무엇을 | 어디서 | 새 서버에서 |
|--------|--------|-------------|
| MariaDB 호스트 | 루트 `.env` `DB_HOST` · `DATABASE_URL` | **서버 안 앱:** `127.0.0.1`. **이 PC `npm run dev`:** 새 공인 IP (그때만 방화벽 3306) |
| CORS | `CORS_ORIGIN` `CORS_ORIGINS` | 서버: `http://<퍼블릭IP>` (끝 슬래시 없음). 이 PC 개발: `http://localhost:3000`. 서버에서 `next dev`로 공인 IP UI를 열면 이 값이 `allowedDevOrigins`에도 쓰임 — 공란 사고: [aws-dashboard-empty-next-dev.md](../references/aws-dashboard-empty-next-dev.md) |
| Grafana iframe | `NEXT_PUBLIC_GRAFANA_HOST` `NEXT_PUBLIC_GRAFANA_PORT` | Grafana를 16GB로 옮기면 새 IP. 구 서버에 남겨 두면 구 IP 유지 |
| vLLM | `CHAT_VLLM_BASE_URL` | **양쪽 모두** `http://127.0.0.1:8001/v1` (터널). 8001을 인터넷에 열지 않음 |
| n8n · Qdrant | `N8N_ISSUE_REPORT_WEBHOOK_URL` `QDRANT_URL` | `http://127.0.0.1:5678/...` · `http://127.0.0.1:6333` |
| AI | `AI_SERVICE_URL` | `http://127.0.0.1:8800` |
| Gmail · 웹훅 시크릿 | `GMAIL_*` `N8N_WEBHOOK_SECRET` | 이 PC `.env`에서 복사. JSON 경로(`GOOGLE_MAIL_SERVICE_ACCOUNT_FILE`)는 서버에 파일 없으면 비움 |

프론트 코드의 Grafana URL은 `frontend/src/lib/grafanaEmbed.ts`가 `.env` 호스트를 붙인다. IP를 페이지에 다시 적지 않는다.

**열지 말 것 (Lightsail 방화벽):** 3000, 3001, 3306(앱이 같은 기계일 때), 5678, 6333, 8001, 8800.  
**열 것:** SSH 22(내 IP), HTTP 80. Grafana를 이 서버에서 iframe으로 쓰면 TCP 4000도 필요(또는 Nginx로 프록시).

---

## 3. 구 서버 MariaDB → 16GB로 옮기기

구 `my-server`가 살아 있는 동안 덤프한다. 암호는 콘솔에 붙여 넣지 말고 프롬프트에만 입력.

구 서버 SSH:

```bash
mysqldump -u kdt -p --databases kdt_project > /tmp/kdt_project.sql
```

이 PC (경로·키·IP는 본인 것):

```powershell
scp -i "키.pem" ubuntu@<구IP>:/tmp/kdt_project.sql .
scp -i "키.pem" .\kdt_project.sql ubuntu@<16GB공인IP>:/tmp/kdt_project.sql
```

16GB SSH (MariaDB 설치·DB/유저 생성 후):

```bash
sudo mysql < /tmp/kdt_project.sql
```

스키마만 새로 깔 때(빈 DB):

```bash
cd ~/KDT-Project
sudo mysql kdt_project < DB/schema.sql
sudo mysql kdt_project < DB/chat_schema.sql
python3 DB/ai-service/apply_user_chat_tables.py
python3 DB/ai-service/apply_text_match.py
```

`bind-address`는 앱이 같은 기계면 **127.0.0.1**. `'kdt'@'127.0.0.1'` 이면 된다. `'kdt'@'%'` + `0.0.0.0` 은 이 PC에서 원격 접속할 때만.

---

## 4. 16GB에서 앱을 돌릴 때 서버 `.env`

이 PC 루트 `.env`를 scp한 뒤 `nano`로 주소만 루프백으로 맞춘다.

```env
DB_HOST=127.0.0.1
DB_PORT=3306
PORT=3001
AI_SERVICE_URL=http://127.0.0.1:8800
CORS_ORIGIN=http://<퍼블릭IP>
CORS_ORIGINS=http://<퍼블릭IP>
N8N_ISSUE_REPORT_WEBHOOK_URL=http://127.0.0.1:5678/webhook/issue-report
QDRANT_URL=http://127.0.0.1:6333
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
DATABASE_URL=mysql+pymysql://kdt:<암호>@127.0.0.1:3306/kdt_project?charset=utf8mb4
```

Docker: 레포 `docker-compose.yml` (포트가 `127.0.0.1`에 묶여 있음).

```bash
cd ~/KDT-Project
docker compose up -d
```

Nginx 샘플: [`deploy/nginx-kdt.conf`](../../deploy/nginx-kdt.conf). HMR은 `/_next/webpack-hmr`만 upgrade. 공인 IP + `next dev` 공란은 [aws-dashboard-empty-next-dev.md](../references/aws-dashboard-empty-next-dev.md).

이 PC에서 개발을 유지할 때 CORS는 `localhost:3000`을 그대로 두고, `DB_HOST`만 새 공인 IP로 바꾼다. 서버용 `.env`와 로컬 `.env`를 섞지 말 것.

---

## 5. GPU 터널 (이 PC)

1. 이 PC에서 vLLM을 `127.0.0.1:8001`에 켠다. [`vllm-setup.md`](../references/vllm-setup.md)
2. 터널을 연 채로 둔다:

```powershell
.\scripts\vllm-tunnel.ps1 -KeyPath "C:\Users\OWNER\Downloads\키.pem" -PublicHost "<16GB공인IP>"
```

스크립트는 SSH keepalive 후 끊기면 재연결한다. Ctrl+C로 중단. 서버 `127.0.0.1:8001`은 이 PC vLLM로 가는 구멍이지, Lightsail에 모델이 있다는 뜻이 아니다.

또는:

```powershell
ssh -i "키.pem" -N -R 8001:127.0.0.1:8001 ubuntu@<16GB공인IP>
```

3. 서버에서 `curl -s http://127.0.0.1:8001/v1/models` 가 되면 요약(`SECURE_GENERATE=1`) 가능.  
   터널이 꺼지면 클라우로 안 넘어가고 실패 안내만 난다.

n8n UI는 5678을 방화벽에 열지 말고:

```powershell
ssh -i "키.pem" -L 5678:127.0.0.1:5678 ubuntu@<16GB공인IP>
```

브라우저 `http://127.0.0.1:5678`.

---

## 6. 이 PC `.env`를 지금 바로 새 IP로 바꾸면

`npm run dev`가 구 `my-server` MariaDB(`DB_HOST`)를 보고 있다.  
16GB에 **덤프를 넣기 전에** `DB_HOST`만 바꾸면 로그인·LOT이 빈 DB이거나 연결 실패한다.

순서: 16GB MariaDB 준비 → 덤프 적용 → 그다음 이 PC `.env`의 `DB_HOST` / `DATABASE_URL` (원격 개발을 유지할 때) 또는 서버에서만 앱을 켠다.

Grafana는 iframe이 **브라우저 → Grafana 호스트**이므로, Grafana를 옮기기 전에는 `NEXT_PUBLIC_GRAFANA_HOST`를 구 IP로 둔다.

---

## 7. 하지 말 것

- GitHub에 `.env`, `.pem`, Gmail 토큰 커밋
- 8001 / 5678 / 6333 / 3306(같은 기계 DB)을 `0.0.0.0/0`으로 열기
- Lightsail에 NVIDIA 드라이버·vLLM 설치 (이 인스턴스는 CPU)
- n8n만 AWS, 백엔드는 PC (메일 콜백이 어긋남)
