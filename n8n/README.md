# n8n — Issue Report 메일 워크플로

**운영 호스트:** AWS `http://3.38.135.192:5678/` (`kdt-n8n`).

## 볼륨 (중요)

| 경로 | 역할 |
|------|------|
| `DB/data/n8n` | **정본** — 컨테이너는 여기만 마운트 |
| `~/.n8n` | 잘못 붙이면 빈 DB처럼 보임. 쓰지 말 것 |

`DB/data/n8n` 옛 DB는 워크플로 0건이었고, 동작 중이던 `KDT Issue Report Mail`을 이 경로로 옮겨 재기동함.

## 워크플로

- 레포 JSON: [`workflows/issue-report.json`](./workflows/issue-report.json)
- 웹훅: `POST /webhook/issue-report`
- 콜백: `http://172.17.0.1:3001/api/internal/n8n/send-email-result` (`id>0`)
- backend: `N8N_ISSUE_REPORT_WEBHOOK_URL=http://127.0.0.1:5678/webhook/issue-report`
