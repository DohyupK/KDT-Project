# 챗봇 수정 전·후 코드 비교

작성일: 2026-08-20  
관련 문서: [`chatbot-fix-report.md`](./chatbot-fix-report.md), [`chatbot-review.md`](./chatbot-review.md)

## 문서 범위

이 문서는 챗봇 메뉴별 답변 개선에서 실제 동작이 달라진 핵심 코드만 `수정 전 → 수정 후` 형태로 모은 것이다. 수정 전 코드는 작업 당시 확인한 구조를 비교에 필요한 범위로 축약했으며, import·타입·예외 처리 등 변화와 직접 관계없는 부분은 생략했다.

## 한눈에 보는 변화

| 항목 | 수정 전 | 수정 후 |
| --- | --- | --- |
| 화면 답변 | 경로와 화면 JSON 나열 | 메뉴별 현황·우선순위·다음 행동 |
| 선택 항목 | 일부 LOT 필드 또는 원시 JSON | 메뉴별 선택 항목 자연어 요약 |
| 상태 표현 | `HIGH`, `pending`, `warning` | `높음`, `대기`, `경고` |
| 화면 요약 인식 | `화면를 요약` 형태만 허용 | `화면을 요약`과 `화면를 요약` 모두 인식 |
| DB 컨텍스트 보강 | 조회 완료까지 대기 | 병렬 조회, 기본 1.2초 후 화면 데이터 사용 |
| 벡터 이력 검색 | 스레드 ID만 있으면 실행 | 단기 이력이 있을 때만 실행 |
| Qdrant 장애 | BGE 로드 후 연결 실패 가능 | Qdrant 선확인, 잠금, timeout, cooldown |

## 1. 화면 요약 의도 인식

파일: `ai-service/agent/api_llm/grounding.py`

### 수정 전

```python
_PAGE_SUMMARY_RE = re.compile(
    r"(이\s*(화면|페이지)\s*요약|"
    r"지금\s*보고\s*있는\s*화면|"
    r"화면\s*데이터를\s*요약|"
    r"페이지를\s*요약|"
    r"(화면|페이지)\s*(데이터\s*)?(를\s*)?(요약|정리)\s*해)",
    re.I,
)
```

`현재 화면을 요약해 주세요.`에서 `화면을`의 조사 `을`을 처리하지 못해 일반 대화 및 벡터 이력 검색 경로로 빠질 수 있었다.

### 수정 후

```python
_PAGE_SUMMARY_RE = re.compile(
    r"(이\s*(화면|페이지)\s*요약|"
    r"지금\s*보고\s*있는\s*화면|"
    r"화면\s*데이터를\s*요약|"
    r"페이지를\s*요약|"
    r"(화면|페이지)\s*(데이터\s*)?((을|를)\s*)?(요약|정리)\s*해)",
    re.I,
)
```

`을`과 `를`을 모두 허용해 실제 UI 문구를 화면 요약으로 정확히 분류한다.

## 2. 메뉴 화면 답변 생성

파일: `ai-service/agent/api_llm/graph.py`, `ai-service/agent/api_llm/grounding.py`

### 수정 전

```python
parts.append(
    join_spaced_parts(
        [
            f"현재 화면 ({route})",
            f"포커스 = {focus}" if focus else None,
            "기준입니다.",
        ]
    )
)

parts.append(
    join_spaced_parts(
        [
            "화면 데이터:",
            json.dumps(page_payload, ensure_ascii=False, default=str)[:1200],
        ]
    )
)
```

답변에 `/dashboard` 같은 내부 경로와 `primary_table`, `items` 등의 화면 데이터 구조가 노출됐다.

### 수정 후

```python
menu_reply = build_menu_context_reply(message, page_context)
if menu_reply:
    parts.append(menu_reply)
```

```python
def build_menu_context_reply(message, page_context):
    route = str(page_context.get("route") or "").lower()
    label = route_label(route)
    pp = _page_payload(page_context)

    if label == "dashboard":
        lines.append("대시보드 위험 현황입니다.")
        lines.append(f"- 위험 LOT: 총 {total}건, 현재 화면 {len(rows)}건")
        lines.append(f"- 우선 확인: {lot_id} · 위험도 {risk_level}")
        lines.append("- 다음 확인: 불량 가능성, 잔류 리튬, SPC 경고 순으로 상세를 확인하세요.")

    elif label == "issue":
        lines.append("이슈 메뉴 현황입니다.")
        lines.append(f"- 열린 이슈: 총 {total}건, 현재 화면 {len(rows)}건")
        lines.append(
            f"- 우선순위 점검: 고위험 {high}건 · "
            f"담당자 미지정 {unassigned}건 · 조치 대기 {missing_action}건"
        )

    return join_spaced_parts(lines, sep="\n") if lines else None
```

지원하는 7개 일반 메뉴별로 별도 업무 요약을 만들며, 지원 메뉴에서는 원시 화면 JSON을 답변으로 사용하지 않는다.

## 3. 선택 항목 답변

파일: `ai-service/agent/api_llm/graph.py`, `ai-service/agent/api_llm/grounding.py`

### 수정 전

```python
field_bits = [
    f"LOT {focus_payload.get('lotId')}" if focus_payload.get("lotId") else None,
    f"등급 {focus_payload.get('grade') or focus_payload.get('status')}",
    f"SPC {focus_payload.get('spcStatus') or focus_payload.get('spc')}",
]

if human:
    parts.append(join_spaced_parts(["포커스 데이터:", human]))
else:
    parts.append(
        join_spaced_parts(
            ["포커스 데이터:", json.dumps(focus_payload, ensure_ascii=False)[:1200]]
        )
    )
```

LOT 중심의 일부 필드만 자연어로 처리했고, 이슈·문의·지식 자료 등은 JSON으로 떨어질 수 있었다.

### 수정 후

```python
focus_reply = build_focus_context_reply(page_context)
if focus_reply:
    parts.append(focus_reply)
```

```python
def build_focus_context_reply(page_context):
    label = route_label(str(page_context.get("route") or ""))
    entity = {
        "main": "LOT",
        "dashboard": "LOT",
        "issue": "이슈",
        "knowledge": "자료",
        "inquiry": "문의",
        "spc": "SPC 항목",
        "setting": "설정",
    }.get(label, "항목")

    lines = [f"선택한 {entity}: {primary or '현재 항목'}"]

    if label == "issue":
        add("관련 LOT", _menu_value(payload, "lotId", "lot_id", "lot"))
        add("위험도", _menu_value(payload, "riskLevel", "risk_level"), display=True)
        add("담당자", _menu_value(payload, "assignee", "manager"))
        add("처리 상태", _menu_value(payload, "processStatus", "status"), display=True)
        add("내용", _menu_value(payload, "title", "issueContent", "content"))

    return join_spaced_parts(lines, sep="\n")
```

선택한 메뉴와 엔티티 종류에 맞는 필드를 골라 출력하고, 알 수 없는 구조도 원시 JSON 대신 화면 상세 확인 안내를 사용한다.

## 4. 내부 코드값의 사용자 문구 변환

파일: `ai-service/agent/api_llm/grounding.py`

### 수정 전

```python
risk_level = _menu_value(row, "riskLevel", "risk", "severity")
status = row.get("status") or "미상"
```

답변에 `HIGH`, `LOW`, `pending`, `dark` 같은 내부 값이 그대로 표시됐다.

### 수정 후

```python
def _menu_display(value):
    labels = {
        "critical": "매우 높음",
        "high": "높음",
        "medium": "중간",
        "low": "낮음",
        "warning": "경고",
        "normal": "정상",
        "pending": "대기",
        "open": "진행 중",
        "in_progress": "처리 중",
        "completed": "완료",
        "closed": "완료",
        "dark": "다크",
        "light": "라이트",
        "system": "시스템 설정",
    }
    return labels.get(text.lower(), text)
```

알려진 상태와 위험도는 한국어 업무 표현으로 변환하고, 알 수 없는 값만 원래 표시값을 유지한다.

## 5. 외부 LLM의 메뉴별 출력 계약

파일: `ai-service/agent/api_llm/llm.py`, `ai-service/agent/api_llm/grounding.py`

### 수정 전

```python
payload = {
    "user_message": message,
    "route": route,
    "page_context": pc_out,
    "grounding": grounding,
}

follow = "recent_turns가 있으면 이어서 대화하세요. "
```

메뉴 데이터는 전달했지만 어떤 순서와 형식으로 답해야 하는지 명시하지 않았다.

### 수정 후

```python
payload = {
    "user_message": message,
    "route": route,
    "route_label": route_label(route),
    "answer_contract": menu_answer_contract(route),
    "page_context": pc_out,
    "grounding": grounding,
}
```

```python
"answer_contract 순서에 맞춰 데이터의 의미, 우선순위, 다음 행동을 답하세요. "
"primary_table, items 같은 내부 JSON 키와 원본 JSON은 사용자에게 출력하지 마세요. "
```

로컬 템플릿뿐 아니라 외부 생성형 LLM도 메뉴별 항목 순서와 JSON 비노출 규칙을 따르도록 했다.

## 6. 페이지 컨텍스트 DB 보강

파일: `backend/src/services/pageChatContext.service.ts`

### 수정 전

```typescript
const pagePayload = await hydratePagePayload(
  route,
  input.pagePayload ?? null,
)
const focusPayload = await hydrateFocus(
  route,
  focusId,
  input.focusPayload ?? null,
)
```

DB 조회가 끝날 때까지 순차적으로 기다려 MariaDB 장애 시 화면 질문도 10~20초 이상 지연됐다.

### 수정 후

```typescript
const DEFAULT_HYDRATE_TIMEOUT_MS = 1_200

async function withHydrateTimeout<T>(
  route: string,
  work: Promise<T>,
  fallback: T,
): Promise<T> {
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), hydrateTimeoutMs())
  })
  return await Promise.race([work, timeout])
}
```

```typescript
const fallback: [unknown, unknown] = [
  input.pagePayload ?? null,
  input.focusPayload ?? null,
]

const [pagePayload, focusPayload] = await withHydrateTimeout(
  route,
  Promise.all([
    hydratePagePayload(route, input.pagePayload ?? null),
    hydrateFocus(route, focusId, input.focusPayload ?? null),
  ]),
  fallback,
)
```

페이지와 선택 항목 조회를 병렬 실행하고, 기본 1.2초를 넘기면 프런트가 보낸 현재 화면 데이터를 즉시 사용한다.

## 7. 불필요한 벡터 이력 검색

파일: `ai-service/app/main.py`

### 수정 전

```python
semantic = (
    vec.search_similar(thread_id=tid, query=body.message)
    if tid
    else []
)
```

스레드 ID만 있으면 단기 대화 이력이 없어도 Qdrant와 임베딩 모델을 초기화했다.

### 수정 후

```python
semantic = (
    vec.search_similar(thread_id=tid, query=body.message)
    if tid and window_text
    else []
)
```

장기 벡터 검색이 실제 단기 이력을 보충할 수 있을 때만 실행한다. 일반 응답과 SSE 스트리밍 경로에 동일하게 적용했다.

## 8. Qdrant 및 BGE 초기화 순서

파일: `ai-service/agent/chat_history_vector.py`

### 수정 전

```python
if _EMBED is None:
    _EMBED = SentenceTransformer(EMBED_MODEL, device=DEVICE)
    _DIM = len(_EMBED.encode(["dim"], normalize_embeddings=True)[0])

if _QDRANT is None:
    _QDRANT = QdrantClient(url=_qdrant_url())

existing = {c.name for c in _QDRANT.get_collections().collections}
```

Qdrant가 꺼져 있어도 대형 BGE-M3 모델을 먼저 로드할 수 있었고, 동시 요청마다 초기화를 중복 실행했다.

### 수정 후

```python
_INIT_LOCK = threading.Lock()
_RETRY_AFTER = 0.0

def _probe_qdrant():
    endpoint = urlparse(_qdrant_url())
    port = endpoint.port or (443 if endpoint.scheme == "https" else 80)
    with socket.create_connection(
        (endpoint.hostname, port),
        timeout=min(0.5, qdrant_timeout_seconds()),
    ):
        return
```

```python
with _INIT_LOCK:
    if time.monotonic() < _RETRY_AFTER:
        return False

    _probe_qdrant()
    _QDRANT = QdrantClient(
        url=_qdrant_url(),
        timeout=qdrant_timeout_seconds(),
        check_compatibility=False,
    )
    existing = {c.name for c in _QDRANT.get_collections().collections}

    if _EMBED is None:
        _EMBED = SentenceTransformer(EMBED_MODEL, device=DEVICE)
```

```python
except Exception:
    _READY = False
    _RETRY_AFTER = time.monotonic() + init_retry_cooldown_seconds()
    return False
```

Qdrant 접근 가능 여부를 먼저 확인하고, 성공한 경우에만 BGE 모델을 로드한다. 잠금과 기본 30초 재시도 유예로 동시·반복 초기화를 막는다.

## 최종 사용자 답변 예시

### 수정 전

```text
현재 화면 (/issues) 기준입니다.
화면 데이터: {"primary_table":"issues","items":[...]}
```

### 수정 후

```text
이슈 메뉴 현황입니다.

- 열린 이슈: 총 4건, 현재 화면 2건
- 우선순위 점검: 고위험 1건 · 담당자 미지정 1건 · 조치 대기 1건
- 확인 대상: ISS-101 · LOT LOT-ALPHA · 위험도 높음
- 다음 처리: 고위험 → 담당자 미지정 → 조치 대기 순으로 확인하세요.
```

선택한 이슈의 경우 다음처럼 답한다.

```text
선택한 이슈: ISS-7

- 관련 LOT: LOT-Z
- 위험도: 높음
- 담당자: 미지정
- 처리 상태: 대기
- 내용: 온도 이탈
```

## 참고

- 이 문서는 핵심 변경점 비교용이며 전체 소스 diff는 아니다.
- 저장소에 Git 메타데이터가 없어 커밋 단위 diff 대신 작업 당시 확인한 수정 전 구조와 현재 코드를 비교했다.
- 상세 테스트 수치와 남은 문제는 [`chatbot-fix-report.md`](./chatbot-fix-report.md)를 참고한다.
