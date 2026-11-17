#!/usr/bin/env node
import { installService, uninstallService } from "./install.js";
import { startHttpServer } from "./server/http.js";
import { startMcpServer } from "./server/mcp.js";

const command = process.argv[2];
if (command === "mcp") await startMcpServer();
else if (command === "install") await installService(process.argv.slice(3));
else if (command === "uninstall") await uninstallService();
else startHttpServer();
