import '../src/loadRootEnv.js'
import mariadb from 'mariadb'

const LOTS_DDL = `
CREATE TABLE LOTS (
  id                VARCHAR(64)  NOT NULL PRIMARY KEY,
  \`timestamp\`       DATETIME     NOT NULL,
  d50               DOUBLE       NULL,
  d90               DOUBLE       NULL,
  metal_impurity    DOUBLE       NULL,
  lithium_input     DOUBLE       NULL,
  additive_ratio    DOUBLE       NULL,
  process_time      DOUBLE       NULL,
  sintering_temp    DOUBLE       NULL,
  humidity          DOUBLE       NULL,
  tank_pressure     DOUBLE       NULL,
  operator_id       VARCHAR(32)  NULL,
  INDEX idx_lots_recorded (\`timestamp\`)
)`

const ANALYSIS_DDL = `
CREATE TABLE ANALYSIS_LOTS (
  lot_id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  probability              DOUBLE       NULL,
  spc_status               VARCHAR(32)  NULL,
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정',
  risk_reason              VARCHAR(255) NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level)
)`

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    const before = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('LOTS', 'ANALYSIS_LOTS')
       ORDER BY TABLE_NAME`,
    )
    console.log(
      'BEFORE',
      (before as { TABLE_NAME: string }[]).map((r) => r.TABLE_NAME),
    )

    // Same connection: pool release would lose session FOREIGN_KEY_CHECKS.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    await conn.query('DROP TABLE IF EXISTS ANALYSIS_LOTS')
    await conn.query('DROP TABLE IF EXISTS LOTS')
    await conn.query(LOTS_DDL)
    await conn.query(ANALYSIS_DDL)
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    const colsLots = (await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'LOTS'
       ORDER BY ORDINAL_POSITION`,
    )) as { COLUMN_NAME: string }[]
    const colsAnalysis = (await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ANALYSIS_LOTS'
       ORDER BY ORDINAL_POSITION`,
    )) as { COLUMN_NAME: string }[]
    const counts = (await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM LOTS) AS lots,
         (SELECT COUNT(*) FROM ANALYSIS_LOTS) AS analysis_lots`,
    )) as { lots: bigint | number; analysis_lots: bigint | number }[]

    console.log('AFTER_TABLES', ['ANALYSIS_LOTS', 'LOTS'])
    console.log('LOTS_COLS', colsLots.map((r) => r.COLUMN_NAME).join(', '))
    console.log('ANALYSIS_COLS', colsAnalysis.map((r) => r.COLUMN_NAME).join(', '))
    console.log('ROW_COUNTS', {
      lots: Number(counts[0]?.lots ?? 0),
      analysis_lots: Number(counts[0]?.analysis_lots ?? 0),
    })
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
