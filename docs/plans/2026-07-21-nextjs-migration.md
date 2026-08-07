# 2026-07-21 Next.js App Router 마이그레이션 (확정 요약)

## 결정

- 라우터: App Router (`src/app`)
- 위치: `dataset/KDT-Project/frontend`
- Vite / react-router-dom 제거
- api / data / types / assets 무손실 이전
- `fillThreshold` 필드명 유지

## 페이지 매핑

| URL | 경로 |
|-----|------|
| `/` | `src/app/page.tsx` |
| `/dashboard` | `src/app/dashboard/page.tsx` |
| `/login` | `src/app/login/page.tsx` |
| `/issue` | `src/app/issue/page.tsx` |
| `/inquiry` | `src/app/inquiry/page.tsx` |
| `/knowledge` | `src/app/knowledge/page.tsx` |
| `/management` | `src/app/management/page.tsx` |
| `/setting` | `src/app/setting/page.tsx` |

## 검증

- `npm run build` 성공
- 8개 라우트 HTTP 200

상세: [../work-log/2026-07-21.md](../work-log/2026-07-21.md)
