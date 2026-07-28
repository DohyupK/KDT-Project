# 로그인 · Ubuntu MariaDB 공용 DB 연동 가이드

조원 4명이 **같은** `kdt_project.users`로 회원가입·중복확인·로그인을 하기 위한 절차입니다.  
프론트/백엔드 코드는 이미 레포에 있으므로, **Lightsail Ubuntu의 MariaDB**와 로컬 `.env`만 맞추면 됩니다.

## 구성

```text
브라우저 localhost:3000 (/login)
  → Next.js rewrite /api → localhost:3001
    → Express /api/auth/*
      → Lightsail Ubuntu MariaDB (DB_HOST=공인 IP)
        → kdt_project.users
```

- FE/BE: 각자 PC에서 `npm run dev`
- DB: AWS Lightsail **Instances** Ubuntu 안의 MariaDB (Create database 관리형 메뉴 아님)

## 기존 Ubuntu가 Running일 때 (재연결)

1. Lightsail → 인스턴스 → **Connect using SSH**
2. MariaDB 기동 확인 (되는 쪽):
   ```bash
   sudo systemctl status mysql
   # 또는
   sudo systemctl status mariadb
   ```
   → `active (running)`
3. DB·테이블:
   ```bash
   sudo mysql -e "SHOW DATABASES;"
   sudo mysql -e "USE kdt_project; SHOW TABLES;"
   ```
   → `kdt_project`, `users`
4. Networking: **Public IPv4 / Static IP** 메모, 방화벽 **TCP 3306** 유지
5. 로컬 `backend/.env` (Git에 올리지 말 것):
   ```env
   DB_HOST=<Public_또는_Static_IP>
   DB_PORT=3306
   DB_USER=kdt
   DB_PASSWORD=<서버에_등록한_암호>
   DB_NAME=kdt_project
   JWT_SECRET=<팀공통문자열>
   CORS_ORIGIN=http://localhost:3000
   PORT=3001
   ```
6. backend / frontend 재시작 → A 가입 → B 같은 아이디 중복확인

## 신규 Ubuntu + MariaDB (인스턴스가 없을 때만)

1. Lightsail **Instances** → Ubuntu 생성  
2. Static IP + 방화벽 TCP 3306  
3. SSH에서:
   ```bash
   sudo apt update
   sudo apt install -y mariadb-server
   sudo systemctl enable --now mysql
   ```
4. DB·계정 (`MariaDB>` 프롬프트 안에서만 SQL):
   ```sql
   CREATE DATABASE kdt_project CHARACTER SET utf8mb4;
   CREATE USER 'kdt'@'%' IDENTIFIED BY '팀_앱암호';
   GRANT ALL PRIVILEGES ON kdt_project.* TO 'kdt'@'%';
   FLUSH PRIVILEGES;
   EXIT;
   ```
5. `bind-address = 0.0.0.0` (`/etc/mysql/mariadb.conf.d/50-server.cnf`) 후 서비스 restart  
6. `users` 테이블: `backend/schema.sql`의 `users` 정의 적용  
7. 위 **재연결** 5~6과 동일하게 `.env` · 팀 검증

### SSH / nano 주의

- Lightsail 브라우저 SSH에서 `Ctrl+W`는 탭이 닫힐 수 있음 → 검색보다 방향키 사용  
- SQL은 `ubuntu@$`가 아니라 `MariaDB [...]>` 안에서만 입력  
- 서비스 이름은 서버마다 `mysql` 또는 `mariadb` → **enable/start에 성공한 이름을 restart에도 그대로** 사용

## Git / 팀 공유

| 올리는 것 | 올리지 않는 것 |
|-----------|----------------|
| 로그인 코드, 이 가이드 | `backend/.env` (비밀번호·IP) |

조원에게는 단톡/노션으로 `DB_HOST`, `DB_USER`, `DB_PASSWORD` 등만 전달 → 각자 로컬 `.env` 수정.

## 실패 시

| 증상 | 점검 |
|------|------|
| 서버 내부 오류 / 500 | backend 로그: `Access denied`, timeout, ECONNREFUSED |
| Access denied | `DB_USER` / `DB_PASSWORD` |
| timeout | 방화벽 3306, `bind-address`, 인스턴스 Running, IP 오타 |

## 관련 문서

- 기술스택·패키지: [login-auth-tech-stack.md](../references/login-auth-tech-stack.md)
- Auth API 요약: [backend/README.md](../../backend/README.md)

## 트러블슈팅: `Cannot find package 'bcryptjs'`

- **원인:** `package.json`에는 있으나 `node_modules`에 미설치 (pull 후 `npm install` 누락).
- **조치:**
  ```powershell
  cd C:\Projects\KDT-Project\backend
  npm install
  npm run dev
  ```
- Ubuntu DB / `.env`와 무관한 **로컬 npm 설치** 문제입니다.

## 변경 기록

| 날짜 | 내용 |
|------|------|
| 2026-07-28 | 초안 작성. 기존 Running Ubuntu 재연결 + 신규 설치 절차. `.env`는 로컬만. |
| 2026-07-28 | `bcryptjs` ERR_MODULE_NOT_FOUND → `npm install` 안내 추가. |
