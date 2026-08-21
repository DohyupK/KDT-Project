# Production build 수정 및 생성형 LLM 준비 상태 기록

작성일: 2026-08-21  
작업 승인: 기존의 비챗봇 수정 금지 조건을 사용자가 이 build 오류 수정에 한해 해제함  
상세 범위: 백엔드 누락 import, Next.js `useSearchParams` Suspense 경계, production build 검증, 생성형 LLM 실행 조건 조사

## 1. 결론

- 백엔드 production build는 정상 통과한다.
- 프런트 production build는 `/issue`, `/inquiry`를 포함한 정적 페이지 12개를 모두 생성하며 정상 통과한다.
- 업무 로직, API 계약, DB 스키마, 페이지 데이터 처리 로직은 변경하지 않았다.
- 새 패키지를 설치하지 않았고 API 키·비밀번호·모델 토큰을 저장소에 기록하지 않았다.
- 일반 챗봇의 실제 생성형 답변을 사용하려면 등록 LLM 키와 `CHAT_USE_LLM=1`이 필요하다.
- 보안 챗봇의 생성형 답변은 설계상 클라우드 폴백이 없으므로 로컬 OpenAI 호환 LLM 서버와 PC 보안 워커가 필요하다.

## 2. 백업과 무결성

수정 전에 다음 경로에 원본을 보관했다.

`build-fix-backups/20260821-before-nonchat-build-fix/`

백업 직후 원본과 백업 파일의 SHA-256이 모두 일치함을 확인했다.

| 파일 | 수정 전 SHA-256 | 수정 후 SHA-256 |
| --- | --- | --- |
| `backend/src/services/analysisLotSyncPoller.ts` | `892C5F766A56AF0E16C7CB85BC3615F723B4431FBC4F0280B911DB55CD162F43` | `9F53AB77653EBD4719856691D8CF4F58C855DEF0BA395EB6E185DC9BA59FC94A` |
| `frontend/src/app/(shell)/issue/page.tsx` | `BCFA14AA7DD429A214A48C4173C9D1DACF9AC86899FB11BA0FF37BC40FFA3161` | `298424E09D5C60BCAD98EC04FD05881AAF00FE6EDC4148CD5D61DF12AF5F09AB` |
| `frontend/src/app/(shell)/inquiry/page.tsx` | `3B1477B29AD5A99808E7341749AC4690620E92135820D779AB0D1F5915C9DB8A` | `4A8CC0E5F3C18FC656652C26582E88B8BD3F6B63050DCF3DF4B8F9C27BBE5B8A` |

문서 목록인 `docs/catalog.md`도 같은 백업 경로에 보관했다. 수정 전 SHA-256은 `A36775ACF1D2B478F03090E8CB73B6D6E0CA986B563CE78BC424376C0420FA05`이다.

## 3. 변경 파일과 전·후 코드

### 3.1 백엔드 폴러의 누락 import

파일: `backend/src/services/analysisLotSyncPoller.ts`

문제:

- `tick()`에서 `fillRecommendedActionsForLots()`를 호출하고 있었다.
- 해당 함수는 `lotRecommendedAction.service.ts`에 정상적으로 export되어 있었지만 폴러 파일이 import하지 않았다.
- TypeScript production build가 `TS2304: Cannot find name 'fillRecommendedActionsForLots'`로 실패했다.
- 같은 기능을 사용하는 `spcLotSync.ts`와 이슈 컨트롤러는 이미 동일 서비스를 정상 import하고 있었다.

수정 전:

```ts
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { pickUnscoredLotIds, splitAnalysisOnly } from './unscoredLots.js'
```

수정 후:

```ts
import * as lotService from './lot.service.js'
import { fillRiskReasonsForLots } from './lotRiskReason.service.js'
import { fillRecommendedActionsForLots } from './lotRecommendedAction.service.js'
import { pickUnscoredLotIds, splitAnalysisOnly } from './unscoredLots.js'
```

변경 이유:

- 새 로직을 추가한 것이 아니라 기존 호출이 참조해야 하는 함수를 연결했다.
- production build 오류와 해당 폴러 실행 시 발생할 수 있는 `ReferenceError`를 함께 제거한다.

### 3.2 `/issue`의 `useSearchParams` Suspense 경계

파일: `frontend/src/app/(shell)/issue/page.tsx`

문제:

- 페이지가 정적 생성 대상이면서 Client Component에서 `useSearchParams()`를 직접 호출했다.
- Next.js 16 production build가 `/issue`에 Suspense 경계가 없다는 이유로 정적 생성을 중단했다.

수정 전 핵심 구조:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function IssuePage() {
  const searchParams = useSearchParams();
  // 기존 페이지 로직
}
```

수정 후 핵심 구조:

```tsx
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

function IssuePageContent() {
  const searchParams = useSearchParams();
  // 기존 페이지 로직 — 변경 없음
}

export default function IssuePage() {
  return (
    <Suspense fallback={null}>
      <IssuePageContent />
    </Suspense>
  );
}
```

변경 이유:

- 검색 파라미터를 읽는 컴포넌트를 Suspense 아래로 이동해 Next.js 정적 생성 계약을 충족한다.
- 기존 이슈 목록·상세·저장·보고서·챗봇 페이지 컨텍스트 로직은 이동하거나 수정하지 않았다.
- `fallback={null}`을 사용해 별도의 임시 UI나 페이지 레이아웃 변경을 만들지 않았다.

### 3.3 `/inquiry`의 동일한 잠재 build 오류 예방

파일: `frontend/src/app/(shell)/inquiry/page.tsx`

문제:

- `/inquiry`도 `/issue`와 동일하게 Client Component 최상단에서 `useSearchParams()`를 호출하고 있었다.
- 최초 build는 `/issue`에서 먼저 중단됐지만, `/issue` 수정 후 `/inquiry`가 같은 이유로 다음 실패 지점이 될 수 있는 구조였다.

수정 전 핵심 구조:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';

export default function InquiryPage() {
  const searchParams = useSearchParams();
  // 기존 페이지 로직
}
```

수정 후 핵심 구조:

```tsx
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

function InquiryPageContent() {
  const searchParams = useSearchParams();
  // 기존 페이지 로직 — 변경 없음
}

export default function InquiryPage() {
  return (
    <Suspense fallback={null}>
      <InquiryPageContent />
    </Suspense>
  );
}
```

변경 이유:

- `/issue`와 같은 Next.js 계약 위반을 같은 최소 패턴으로 제거했다.
- 문의 목록·작성·첨부·로그인·딥링크 로직은 변경하지 않았다.

## 4. Production build 검증

사용자가 이번 작업에서 production build 실행을 승인한 후 다음 명령을 실행했다.

### 4.1 백엔드

```powershell
cd backend
npm.cmd run build
```

결과:

- 종료 코드: `0`
- 실행 시간: 약 `14.1초`
- 실행 내용: `tsc -p tsconfig.json`
- 기존 `fillRecommendedActionsForLots` 미정의 오류가 사라졌다.

### 4.2 프런트

```powershell
cd frontend
npm.cmd run build
```

결과:

- 종료 코드: `0`
- 총 실행 시간: 약 `64.2초`
- optimized production compile: `10.6초`
- TypeScript: `21.3초`
- 정적 페이지 생성: `12/12`, 약 `1.523초`
- `/issue`: 정적 생성 성공
- `/inquiry`: 정적 생성 성공

생성된 App Router 경로:

```text
/
/_not-found
/dashboard
/inquiry
/issue
/knowledge
/login
/main
/management
/security
/setting
```

build가 생성한 `backend/dist`와 `frontend/.next`는 production 산출물이며 소스 변경 목록에는 포함하지 않는다.

## 5. 생성형 LLM 준비 상태 조사

### 5.1 현재 PC에서 확인한 상태

| 항목 | 상태 |
| --- | --- |
| 프런트 `:3000` | 실행 중 |
| 백엔드 `:3001` | 실행 중 |
| AI 서비스 `:8800` | 실행 중 |
| 인증된 `GET /api/llm-keys` | 정상 응답, 등록 키 `0개` |
| 로컬 생성 서버 `:8001` | 실행되지 않음 |
| `vllm` 명령 | 설치되지 않음 |
| LM Studio `lms` 명령·기본 설치 경로 | 확인되지 않음 |
| WSL 배포판 | 없음 |
| Hugging Face 로컬 캐시 | `BAAI/bge-m3`만 확인 |

`BAAI/bge-m3`는 검색용 임베딩 모델이며 사용자 답변을 생성하는 LLM이 아니다.

키 목록 확인은 로그인 후 인증된 백엔드 API로 수행했다. 목록 API는 설계상 `api_key` 원문을 반환하지 않으며, 이번 확인에서도 키 값은 읽거나 출력하지 않았다. 등록 레코드가 0개이므로 현재 일반 챗봇이 호출할 외부 생성 공급자가 없다.

### 5.2 일반 챗봇의 실제 생성 답변 활성화 조건

일반 챗봇은 등록된 클라우드 또는 OpenAI 호환 API를 사용할 수 있다. 코드상 다음 조건이 모두 필요하다.

1. AI 서비스 실행 환경에 `CHAT_USE_LLM=1`
2. 백엔드 실행 환경에 16자 이상의 `LLM_KEYS_ENCRYPTION_KEY`
3. 로그인 후 설정 화면에서 Groq·Gemini·OpenAI 호환 등 실제 API 키 등록
4. 백엔드와 AI 서비스 재시작
5. 응답의 `provider`가 `template`이 아닌 등록 공급자로 표시되는지 확인

일반 챗봇 공급자 코드는 `.env`의 Groq/Gemini 키를 직접 읽지 않는다. 암호화된 키 저장소에서 백엔드가 복호화해 요청 단위로 AI 서비스에 전달한다. 실제 키는 문서·채팅·소스에 기록하지 않는다.

권장 품질 검증 항목:

- 화면·메뉴별 답변 계약 준수
- LOT·이슈·문의 ID 범위 고정
- 내부 JSON 키 미노출
- 이전 대화 기억
- 근거가 없을 때 추측하지 않는지
- 모델 예측 확률·임계값·symbolic OR 설명 유지
- API 실패 시 템플릿 폴백과 사용자 오류 문구

### 5.3 보안 챗봇의 실제 생성 답변 활성화 조건

보안 챗봇은 설계상 클라우드 LLM 폴백을 사용하지 않는다. 다음 항목이 필요하다.

1. 이 PC에서 OpenAI 호환 로컬 LLM 서버를 `127.0.0.1:8001/v1`에 실행
2. `CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1`
3. `CHAT_VLLM_MODEL=<서버가 실제 노출하는 모델 ID>`
4. 보안 문서 Qdrant 컬렉션 준비
5. MariaDB 연결 준비
6. 프로젝트의 PC 보안 워커 실행: `npm run security-pc`

현재 PC에는 실행 가능한 로컬 생성 서버와 생성 모델이 확인되지 않았으므로, 모델 선택·다운로드·서버 설치가 선행되어야 한다. 모델 용량과 GPU/메모리 적합성을 확인한 뒤 별도 승인 하에 설치해야 한다.

## 6. 수정하지 않은 영역

- 이슈·문의 API와 DB 쿼리
- 페이지의 데이터 변환·필터·상태 처리
- 챗봇 코드와 모델 파일
- AI 키 값과 암호화 저장소 데이터
- 환경 파일과 실행 서비스 설정
- 패키지 의존성

## 7. 롤백 위치

원본은 다음 파일에 보관돼 있다.

```text
build-fix-backups/20260821-before-nonchat-build-fix/
├─ backend/src/services/analysisLotSyncPoller.ts
├─ frontend/src/app/(shell)/issue/page.tsx
├─ frontend/src/app/(shell)/inquiry/page.tsx
└─ docs/catalog.md
```

롤백이 필요하면 현재 파일을 다시 별도 보관한 뒤 위 원본을 같은 상대 경로로 복원한다. 복원 후에는 백엔드와 프런트 production build를 다시 실행해 결과를 확인해야 한다.

## 8. 최종 상태

- 요청받은 build 오류 수정: 완료
- 백엔드 production build: 통과
- 프런트 production build: 통과
- 수정 내역 문서화: 완료
- 실제 일반 생성형 LLM 품질 검증: API 키 활성화 대기
- 실제 보안 생성형 LLM 품질 검증: 로컬 모델 서버 설치·기동 대기
