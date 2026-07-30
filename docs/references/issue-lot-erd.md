# Issue / LOT 시각 ERD

최종 갱신: 2026-07-30  
DDL 소스: [`backend/schema.sql`](../../backend/schema.sql)  
DBML 소스: [`issue-lot.dbml`](./issue-lot.dbml) (schema와 동일)

첨부와 같은 **컬러 테이블 · 컬럼 · 타입 · PK/FK · 1:N** 그림을 그리는 방법입니다.

## 그림 그리기 (dbdiagram.io)

1. Cursor/탐색기에서 [`issue-lot.dbml`](./issue-lot.dbml) 열기  
2. 파일 **전체** 선택 후 복사 (`Ctrl+A` → `Ctrl+C`)  
3. 브라우저에서 [https://dbdiagram.io](https://dbdiagram.io) 접속 (계정 없이도 가능)  
4. 왼쪽 에디터에 붙여넣기 (`Ctrl+V`)  
5. 오른쪽에 ERD가 자동 렌더링됨  
6. 상단 메뉴 **Export → PNG** (또는 PDF)로 저장

## 포함 테이블

| 테이블 | 내용 |
|--------|------|
| `users` | 로그인 사용자 |
| `user_settings` | font_size, theme_mode, refresh_interval |
| `lots` | LOT SSOT · 위험도 |
| `issues` | issue_id, lot_id, occurred_at, risk_level, status, title, action_content, assignee_user_id, completed_at |
| `handover_history` | 후속(구조 TBD) — 현재 DDL 그대로 표시 |

## 제외

- `issue_analyses` (삭제됨)
- `user_settings.language` / `auto_refresh_enabled` / `n8n_alert` (삭제됨)
- `issues.completed` / `created_at` / `updated_at` (삭제됨)

## 관계

- `user_settings.user_id` → `users.user_id`
- `issues.lot_id` → `lots.lot_id`
- `issues.assignee_user_id` → `users.user_id`
- `handover_history` → `issues` / `lots` / `users` (후속)
