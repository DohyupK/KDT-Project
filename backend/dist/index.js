"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const inquiry_routes_1 = __importDefault(require("./routes/inquiry.routes"));
const main_routes_1 = __importDefault(require("./routes/main.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const issue_routes_1 = __importDefault(require("./routes/issue.routes"));
const knowledge_routes_1 = __importDefault(require("./routes/knowledge.routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const port = Number(process.env.PORT ?? 3001);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
app.use((0, cors_1.default)({ origin: corsOrigin, credentials: true }));
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use('/api/inquiries', inquiry_routes_1.default);
app.use('/api/main', main_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/issues', issue_routes_1.default);
app.use('/api/knowledge', knowledge_routes_1.default);
app.use(errorHandler_1.errorHandler);
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
