#!/usr/bin/env node
// ============================================================
// Sellfox MCP stdio entrypoint — mirrors server.py
// ============================================================

import { SellfoxMCPApplication, runStdioServer } from "./mcp-server.js";

runStdioServer(new SellfoxMCPApplication());
