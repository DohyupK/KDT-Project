"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
const mariadb_1 = __importDefault(require("mariadb"));
const pool = mariadb_1.default.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'kdt_project',
    connectionLimit: 5,
});
async function query(sql, params) {
    let conn;
    try {
        conn = await pool.getConnection();
        return (await conn.query(sql, params));
    }
    finally {
        if (conn)
            conn.release();
    }
}
exports.default = pool;
