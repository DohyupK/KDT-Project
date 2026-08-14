# 이슈 보고서 메일 (구현 SSOT)

최종 갱신: 2026-08-14  
상태: **구현됨** (n8n → Gmail API). SMTP 직접 발송은 채택하지 않음.  
관련: [`issue-lot-api.md`](./issue-lot-api.md) · [`DB/send_email.sql`](../../DB/send_email.sql)

메인 「위험 LOT Top」과 같은 조건의 LOT이 **새로** 생기면, 이슈 관리 「PDF 다운로드」와 같은 LOT 보고서 HTML을 n8n → Google Cloud Gmail API로 보낸다. 이미 쌓여 있는 과거 LOT는 보내지 않는다.

---

## 동작 요약

| 항목 | 구현 |
|------|------|
| 트리거 | `risk_level = '심각'` **그리고** `lots.timestamp` 최근 3일 |
| 본문 | LOT 보고서 HTML (미완료 이슈만). `send_email.mail_contents` LONGTEXT |
| 채널 | INSERT `send_email` → n8n 웹훅 → Gmail API `text/html` → 콜백 `send` O/X |
| 자격 증명 | 모노레포 **루트 `.env`**. n8n Credential UI에 키를 두지 않음 |
| 수신자 | `user_settings.email_check = 'O'` 인 `users` |
| 중복 | LOT당 사용자당 1회. `send_email`에 행이 있으면 `send`가 X여도 **재시도하지 않음** |
| 과거 데이터 | 기능 첫 틱에 이미 Top인 LOT는 `send='X'` + `baseline_skip`만 넣고 발송하지 않음 |
| UI | 이슈 페이지 「PDF 다운로드」 유지. 헤더 알림 토글 → `email_check` |
| 수동 재발송 | `npm run send:one-issue-report` (backend) |

HTML 메일은 Gmail/아웃룩에서 표·제목이 있는 문서로 렌더된다. 브라우저 인쇄 PDF와 픽셀 일치는 아니다.

---

## 흐름

```mermaid
flowchart TD
  poller["SPC / analysis 폴러"] --> seed["ensureIssuesForRiskLots"]
  seed --> pick["RISK_TOP_WHERE AND send_email에 없는 lot"]
  pick --> skip["첫 틱: 기존 Top은 send=X만 INSERT"]
  pick --> html["LOT 보고서 HTML"]
  html --> users["user_settings.email_check = O"]
  users --> insert["send_email INSERT send=X"]
  insert --> token[".env Gmail refresh → access token"]
  token --> webhook["n8n 웹훅"]
  webhook --> mailApi["Gmail API text/html"]
  mailApi --> cb["콜백 send O 또는 X"]
```

---

## 테이블

`email_check`는 `user_settings` 컬럼이라 `send_email`이 그 컬럼을 FK로 걸 수 없다. `user_id`로 JOIN 한다.

DDL: [`DB/send_email.sql`](../../DB/send_email.sql) · [`DB/schema.sql`](../../DB/schema.sql)  
마이그레이션: `npm run migrate:send-email` (`backend/`)

### `user_settings.email_check`

CHAR(1) NOT NULL DEFAULT `'X'` — `'O'` 수신 / `'X'` 거부 (옵트인). 헤더 알림 팝오버 토글.

### `send_email`

| 컬럼 | 역할 |
|------|------|
| `id` | PK |
| `lot_id` | FK → `lots.id` |
| `user_id` | FK → `users.user_id` |
| `email` | 발송 시점 `users.email` 스냅샷 |
| `mail_contents` | LOT 보고서 HTML |
| `send` | `'O'` 성공 / `'X'` 미발송·실패 (기본 `'X'`) |
| `created_at` / `sent_at` | 생성 · 성공 시각 |
| `error` | 실패 메시지. 첫 틱 스킵은 `baseline_skip` |
| UNIQUE `(lot_id, user_id)` | 사용자당 LOT 1행 |

---

## 루트 `.env` (값 커밋 금지)

키 이름만 `backend/.env.example`. 서비스 계정 JSON 본문·private key를 레포/로그/웹훅에 넣지 않는다. `.env`에는 **파일 경로만**.

- `N8N_ISSUE_REPORT_WEBHOOK_URL` (기본 `http://127.0.0.1:5678/webhook/issue-report`)
- `N8N_WEBHOOK_SECRET`
- `ISSUE_REPORT_MAIL_ENABLED` (`0`이면 기능 off)
- `ISSUE_REPORT_MAIL_FROM` (No-reply)
- `GOOGLE_MAIL_SERVICE_ACCOUNT_FILE` — GCP 서비스 계정 JSON 경로
- `GOOGLE_MAIL_DELEGATED_USER` — 발신 Workspace 사용자

웹훅 페이로드: `{ id, lotId, to, subject, html, from, noReply, accessToken }`  
제목: `[이슈 보고서] LOT {lotId} · 심각`  
콜백: `POST /api/internal/n8n/send-email-result` `{ id, send }` + `Authorization: Bearer N8N_WEBHOOK_SECRET`

n8n 노드: Webhook → Gmail API(HTML) → HTTP Request(콜백). 워크플로 JSON은 레포에 없음. 컨테이너: `kdt-n8n` (:5678). `npm run dev`는 n8n을 켜지 않는다.

화면 PDF: `frontend` 이슈 페이지 `buildIssueReportPdfHtml` → `window.print()`. 서버 PDF API 아님.

---

## 구현 범위 밖 (채택하지 않음)

- 주간/월간 보고서 메일
- PDF 바이너리 생성·첨부
- 백엔드 nodemailer/SMTP 직접 발송
- Gmail 키를 n8n Credential UI·레포에 저장
- 완료 이슈(과거 자료)·이미 Top이던 LOT 일괄 발송
