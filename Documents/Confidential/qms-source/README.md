# QMS 문서 배치 (사용자 직접)

멘토 제공 QMS `.docx`를 여기에 넣으세요.

- `Documents/Confidential/qms-source/` — 원본 Word (모달 열람)
- `Documents/Confidential/Markdown/qms/` — RAG용 Markdown + frontmatter

배치 후:

```bash
cd ai-service
python ingest_secure.py
cd ../backend
npm run fill:recommended-actions
```
