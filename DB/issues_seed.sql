-- Seed optional mock lots for issue page (issues rows left empty by default).
-- analysis_lots is scored by backend (not seeded).
-- Safe to re-run: existing PK rows are not overwritten (INSERT IGNORE).
-- To seed issues, insert with: issue_id, lot_id, issue_content, action_content,
--   assignee_user_id, completed_at, created_at (no status / risk_level).

INSERT IGNORE INTO lots
  (id, `timestamp`)
VALUES
  ('LOT-CA-260721-08', '2026-07-21 15:42:00'),
  ('LOT-CA-260721-07', '2026-07-21 14:18:00'),
  ('LOT-CA-260721-05', '2026-07-21 11:05:00'),
  ('LOT-CA-260720-12', '2026-07-20 23:36:00'),
  ('LOT-CA-260720-09', '2026-07-20 18:12:00'),
  ('LOT-CA-260719-06', '2026-07-19 16:48:00'),
  ('LOT-CA-260719-02', '2026-07-19 09:22:00'),
  ('LOT-CA-260718-11', '2026-07-18 21:10:00');

-- issues intentionally empty after migrate:issues-refactor.
-- Example (commented):
-- INSERT IGNORE INTO issues
--   (issue_id, lot_id, issue_content, action_content, assignee_user_id, completed_at, created_at)
-- VALUES
--   ('ISS-260721-018', 'LOT-CA-260721-08', '소성로 온도 상한 초과 요약',
--    '소성 온도 하향 조정 중.', NULL, NULL, '2026-07-21 15:42:00');
