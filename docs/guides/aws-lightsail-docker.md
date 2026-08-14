# Lightsail에 Docker (n8n · Qdrant)

최종 갱신: 2026-08-15

MariaDB 공용 DB는 이미 Lightsail Ubuntu다. 절차: [`login-ubuntu-mariadb.md`](./login-ubuntu-mariadb.md).  
이 문서는 **n8n·Qdrant 컨테이너를 그 서버(또는 같은 방식의 Ubuntu)에 올리는 방법**이다.

포트·주소 숫자는 **루트 `.env`** 만 본다. 로컬 포트·기동 주체: [`documents-watcher-qdrant.md`](../references/documents-watcher-qdrant.md). 시크릿·공인 IP·토큰 커밋 금지.

로컬 PC에서는 루트 [`docker-compose.yml`](../../docker-compose.yml)로 `kdt-n8n` · `kdt-qdrant`를 켠다.

```bash
docker compose up -d
```

데이터: `DB/data/n8n/` · `DB/data/qdrant_storage/` (gitignore). FE/BE/ai는 여전히 `npm run dev`.  
Qdrant만 켜 둔 직후 `secure_docs` 가 비어 있으면 ingest **한 번**. 상시 구분: [`documents-watcher-qdrant.md`](../references/documents-watcher-qdrant.md) §6.  
이슈 메일: [`issue-report.md`](../references/issue-report.md).

---

## 지금 구성

| 위치 | 무엇이 도나 |
|------|-------------|
| 이 PC | `npm run dev` → `:3000` FE · `:3001` BE · `:8800` ai. Docker `kdt-n8n` · `kdt-qdrant` |
| Lightsail Ubuntu | MariaDB (`DB_HOST` · `DB_PORT`) |

`.env`에서 앱 URL은 로컬 루프백이다 (`AI_SERVICE_URL`, `N8N_ISSUE_REPORT_WEBHOOK_URL`, `CORS_ORIGIN`). DB만 원격이다.

---

## 왜 n8n만 AWS에 두면 안 되나

메일은 backend(`PORT`) → n8n 웹훅(`N8N_ISSUE_REPORT_WEBHOOK_URL`) → Gmail → 콜백 `POST /api/internal/n8n/send-email-result`.

로컬 n8n은 콜백을 `host.docker.internal` + `PORT`로 보낸다. n8n만 Lightsail에 있고 backend가 PC면, 서버 n8n은 그 PC의 Express에 닿지 못한다.

| 올려도 됨 | 깨짐 |
|-----------|------|
| MariaDB만 AWS (현재) | n8n만 AWS, backend는 PC |
| **같은 Ubuntu**에 n8n + backend (필요 시 ai·Qdrant) | Qdrant `:6333`을 인터넷에 공개 |

Qdrant는 기본 인증이 없다. 방화벽에서 `6333`을 열지 않는다.

---

## 1. Lightsail에 Docker

SSH(Connect using SSH) 후:

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

세션을 끊었다가 다시 접속한 뒤 `docker ps`.

Lightsail Networking — **쓰는 포트만**. 값은 `.env`와 맞출 것.

| `.env` 키 / 서비스 | 방화벽 TCP | 공개 |
|--------------------|------------|------|
| `DB_PORT` MariaDB | 3306 | 이미 있음. 가능하면 조원 IP만 |
| n8n UI·웹훅 | 5678 | 가능하면 **닫고** SSH 터널 |
| Qdrant | 6333 · 6334 | **닫기** |
| `PORT` backend | 3001 | 서버에서 앱을 돌릴 때만 |
| `CORS_ORIGIN` 프론트 | 3000 | 서버에서 UI를 돌릴 때만 |
| `AI_SERVICE_URL` | 8800 | 서버에서 ai를 돌릴 때만 |
| SSH | 22 | 유지 |

n8n UI를 로컬에서만 보려면 (방화벽 5678 닫은 채):

```bash
ssh -L 5678:127.0.0.1:5678 ubuntu@<DB_HOST와_같은_호스트>
```

브라우저 `http://127.0.0.1:5678`. 이 경우 `N8N_ISSUE_REPORT_WEBHOOK_URL`도 로컬 `127.0.0.1:5678`이면 된다.

---

## 2. 컨테이너 (볼륨 필수)

로컬 `kdt-n8n`은 볼륨이 없을 수 있다. 서버에서 `-v` 없이 올리면 재생성 시 로그인·워크플로가 사라진다.

```bash
sudo mkdir -p /opt/kdt/n8n /opt/kdt/qdrant
sudo chown -R ubuntu:ubuntu /opt/kdt

docker run -d --name kdt-qdrant --restart unless-stopped \
  -p 127.0.0.1:6333:6333 -p 127.0.0.1:6334:6334 \
  -v /opt/kdt/qdrant:/qdrant/storage \
  qdrant/qdrant

docker run -d --name kdt-n8n --restart unless-stopped \
  -p 127.0.0.1:5678:5678 \
  -v /opt/kdt/n8n:/home/node/.n8n \
  -e N8N_SECURE_COOKIE=false \
  n8nio/n8n
```

`127.0.0.1:포트`로 묶으면 인터넷에 안 열린다.

워크플로는 로컬 n8n에서 export → 서버 n8n에 import. 컨테이너 이미지 통째 복사는 비권장.

메모리: n8n+Qdrant면 **2GB 이상** Lightsail이 안전하다.

---

## 3. 앱을 같은 Ubuntu에서 돌릴 때 `.env`

backend·ai가 **그 서버**에서 n8n/Qdrant를 루프백으로 보면 된다.

| 키 | 서버에서 |
|----|----------|
| `DB_HOST` | `127.0.0.1` (같은 머신 MariaDB) 또는 지금 공인 호스트 |
| `PORT` | 기존과 동일 |
| `AI_SERVICE_URL` | `http://127.0.0.1:8800` |
| `N8N_ISSUE_REPORT_WEBHOOK_URL` | `http://127.0.0.1:5678/webhook/issue-report` |
| n8n → backend 콜백 | `http://127.0.0.1:<PORT>/api/internal/n8n/send-email-result` (n8n 컨테이너면 `host.docker.internal` 또는 호스트 IP) |
| `QDRANT_URL` | `http://127.0.0.1:6333` |
| `CORS_ORIGIN` | 브라우저가 여는 프론트 origin |

n8n을 **공인 호스트:5678**로 열면 Google OAuth **승인된 리디렉션 URI**도 그 주소의 `/rest/oauth2-credential/callback`으로 바꾼다. SSH 터널이면 로컬 `127.0.0.1:5678` 콜백 유지.

`.env`·GCP JSON·Gmail 토큰은 서버에 복사하되 Git에 넣지 않는다.

---

## 로컬에서 메일 시험

Docker Desktop + `kdt-n8n` Published + backend 기동 후:

```bash
cd backend
npm run send:one-issue-report
```

폴러는 `send_email`에 이미 있는 LOT을 다시 보내지 않는다. 이 스크립트만 수동 재발송이다.

---

## 관련

- [`login-ubuntu-mariadb.md`](./login-ubuntu-mariadb.md) — Lightsail MariaDB  
- [`documents-watcher-qdrant.md`](../references/documents-watcher-qdrant.md) — 포트 · `npm run dev`  
- [`issue-report.md`](../references/issue-report.md) — 메일 파이프라인  
