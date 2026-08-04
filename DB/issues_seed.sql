-- Seed basic issue-page mock data into the existing lots/issues schema.
-- Safe to re-run: existing LOT and issue rows are not overwritten.
-- SPC/process/AI analysis fields are intentionally excluded until their contract is defined.

INSERT IGNORE INTO lots
  (lot_id, recorded_at, risk_level)
VALUES
  ('LOT-CA-260721-08', '2026-07-21 15:42:00', '높음'),
  ('LOT-CA-260721-07', '2026-07-21 14:18:00', '중간'),
  ('LOT-CA-260721-05', '2026-07-21 11:05:00', '낮음'),
  ('LOT-CA-260720-12', '2026-07-20 23:36:00', '높음'),
  ('LOT-CA-260720-09', '2026-07-20 18:12:00', '중간'),
  ('LOT-CA-260719-06', '2026-07-19 16:48:00', '낮음'),
  ('LOT-CA-260719-02', '2026-07-19 09:22:00', '중간'),
  ('LOT-CA-260718-11', '2026-07-18 21:10:00', '높음');

INSERT IGNORE INTO issues
  (issue_id, lot_id, occurred_at, risk_level, status, title,
   action_content, assignee_user_id, completed_at)
VALUES
  ('ISS-260721-018', 'LOT-CA-260721-08', '2026-07-21 15:42:00', '높음', '조치 중',
   '소성로 2호기 온도 상한 지속 초과',
   '소성 온도를 742°C로 하향 조정하고 냉각 계통을 점검 중입니다.',
   NULL, NULL),

  ('ISS-260721-017', 'LOT-CA-260721-07', '2026-07-21 14:18:00', '중간', '분석 중',
   '리튬 투입 속도 편차 증가',
   '공급기 센서 로그와 계량기 교정 이력을 비교 분석하고 있습니다.',
   NULL, NULL),

  ('ISS-260721-016', 'LOT-CA-260721-05', '2026-07-21 11:05:00', '낮음', '완료',
   '혼합기 습도 센서 일시 이상',
   '센서 커넥터를 재체결하고 정상 신호 수신을 확인했습니다.',
   NULL, NULL),

  ('ISS-260720-015', 'LOT-CA-260720-12', '2026-07-20 23:36:00', '높음', '접수',
   '냉각 구간 압력 급상승',
   NULL,
   NULL, NULL),

  ('ISS-260720-014', 'LOT-CA-260720-09', '2026-07-20 18:12:00', '중간', '완료',
   '입도 분포 D50 기준치 접근',
   '분쇄기 회전수를 3% 낮추고 재측정하여 정상 범위를 확인했습니다.',
   NULL, NULL),

  ('ISS-260719-013', 'LOT-CA-260719-06', '2026-07-19 16:48:00', '낮음', '완료',
   '검사 장비 이미지 수집 지연',
   '카메라 캐시를 초기화하고 네트워크 지연 상태를 점검했습니다.',
   NULL, NULL),

  ('ISS-260719-012', 'LOT-CA-260719-02', '2026-07-19 09:22:00', '중간', '조치 중',
   '전구체 수분 함량 변동 감지',
   '원료 보관 습도와 건조 공정 시간을 재조정하고 있습니다.',
   NULL, NULL),

  ('ISS-260718-011', 'LOT-CA-260718-11', '2026-07-18 21:10:00', '높음', '분석 중',
   '예측 불량률 2.5% 초과',
   '동일 조건 과거 LOT와 공정 파라미터를 교차 분석 중입니다.',
   NULL, NULL);

-- Preserve the users FK: map mock assignee names only when a matching real user exists.
UPDATE issues i
JOIN (
  SELECT 'ISS-260721-018' AS issue_id, '김현수' AS assignee_name
  UNION ALL SELECT 'ISS-260721-017', '박서연'
  UNION ALL SELECT 'ISS-260721-016', '이도윤'
  UNION ALL SELECT 'ISS-260720-014', '최유진'
  UNION ALL SELECT 'ISS-260719-013', '정민재'
  UNION ALL SELECT 'ISS-260719-012', '한지우'
  UNION ALL SELECT 'ISS-260718-011', '김현수'
) mock_assignee ON mock_assignee.issue_id = i.issue_id
JOIN (
  SELECT name, MIN(user_id) AS user_id
  FROM users
  GROUP BY name
) matched_user ON matched_user.name = mock_assignee.assignee_name
SET i.assignee_user_id = matched_user.user_id
WHERE i.assignee_user_id IS NULL;
