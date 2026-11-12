import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mergeOrigins, normalizeOrigin, originAllowed, readStartupOrigins, writeConfigFile, type CanvasAgentConfig } from "./config.js";

const sample: CanvasAgentConfig = { url: "http://127.0.0.1:17371", token: "test-token", origins: ["http://localhost:3100", "https://canvas.example.com"] };

function makeTempBase(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-config-test-"));
}

// POSIX-only: chmod semantics differ on Windows, where these modes are advisory.
const posix = process.platform === "win32" ? { skip: true } : {};

test("writeConfigFile creates directory 0700 and file 0600", posix, () => {
    const base = makeTempBase();
    const dir = path.join(base, "nested-config");
    const file = path.join(dir, "canvas-agent.json");
    try {
        writeConfigFile(dir, file, sample);
        assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test("writeConfigFile tightens existing loose permissions", posix, () => {
    const base = makeTempBase();
    const dir = path.join(base, "existing-config");
    const file = path.join(dir, "canvas-agent.json");
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    fs.writeFileSync(file, "{}", { mode: 0o644 });
    try {
        writeConfigFile(dir, file, sample);
        assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test("writeConfigFile persists the config content", () => {
    const base = makeTempBase();
    const file = path.join(base, "canvas-agent.json");
    try {
        writeConfigFile(base, file, sample);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), sample);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test("normalizeOrigin keeps http and https origins", () => {
    assert.equal(normalizeOrigin("http://localhost:3100/canvas/abc"), "http://localhost:3100");
    assert.equal(normalizeOrigin("https://app.example.com"), "https://app.example.com");
    assert.equal(normalizeOrigin("file:///tmp"), null);
    assert.equal(normalizeOrigin("not a url"), null);
});

test("readStartupOrigins collects unique --origin and env values", () => {
    assert.deepEqual(
        readStartupOrigins(["--debug", "--origin", "http://localhost:3100/x", "--origin", "http://localhost:3100"], { OIOI_CANVAS_ORIGIN: "https://app.example.com/path" }),
        ["http://localhost:3100", "https://app.example.com"],
    );
});

test("mergeOrigins and originAllowed only accept listed origins", () => {
    const config: CanvasAgentConfig = { url: "http://127.0.0.1:17371", token: "test-token" };
    assert.equal(mergeOrigins(config, ["http://localhost:3100"]), true);
    assert.equal(mergeOrigins(config, ["http://localhost:3100"]), false);
    assert.equal(originAllowed("http://localhost:3100", config.origins), true);
    assert.equal(originAllowed("https://evil.example", config.origins), false);
    assert.equal(originAllowed("", config.origins), false);
});
