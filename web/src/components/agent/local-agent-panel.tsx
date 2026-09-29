import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Tooltip } from "antd";
import { Bot, PanelRightClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import i18n from "@/i18n";
import { readAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";
import { isSiteTool, runSiteTool } from "@/lib/agent/agent-site-tools";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { randomId } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import { activateAgentClient, discoverAgentConfig, postState, postToolResult } from "@/services/api/canvas-agent";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAgentStore, type AgentCanvasContext } from "@/stores/use-agent-store";
import { type CanvasAgentOp, type CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { AgentConnectView } from "./agent-connect-view";

const DEFAULT_AGENT_URL = "http://127.0.0.1:17371";
const AGENT_PROTOCOL_VERSION = 6;
const rt = (key: string, options?: Record<string, unknown>) => i18n.t(`agent.runtime.${key}`, options);

type AgentPendingToolCall = { requestId: string; name: string; input?: { ops?: CanvasAgentOp[]; path?: string; nodes?: unknown } & Record<string, unknown> };
type AgentHelloEvent = { ok?: boolean; protocolVersion?: number };
type AgentClientGlobal = typeof globalThis & { __oioiCanvasAgentClientIdPromise?: Promise<string> };

function parseEventData<T>(event: Event) {
    try {
        return JSON.parse((event as MessageEvent).data) as T;
    } catch {
        return null;
    }
}

export function LocalAgentPanel({ embedded }: { embedded?: boolean }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { message } = App.useApp();
    const { hash } = useLocation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { url, token, connected, enabled, activity, connectError } = useAgentStore(
        useShallow((state) => ({
            url: state.url,
            token: state.token,
            connected: state.connected,
            enabled: state.enabled,
            activity: state.activity,
            connectError: state.connectError,
        })),
    );
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const closePanel = useAgentStore((state) => state.closePanel);
    const canvasContextRef = useRef<AgentCanvasContext | null>(useAgentStore.getState().canvasContext);
    const autoConnectRef = useRef(false);
    const connectedRef = useRef(false);
    const errorLoggedRef = useRef(false);
    const clientIdRef = useRef("");
    const [clientReady, setClientReady] = useState(false);
    const endpoint = useMemo(() => url.trim().replace(/\/$/, ""), [url]);
    const urlAgentAutoConnect = searchParams.has("agentUrl") && searchParams.has("agentToken");

    useEffect(() => {
        let disposed = false;
        void acquireAgentClientId().then((clientId) => {
            if (!disposed) {
                clientIdRef.current = clientId;
                setClientReady(true);
            }
        });
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = useAgentStore.subscribe((state) => {
            if (state.canvasContext === canvasContextRef.current) return;
            canvasContextRef.current = state.canvasContext;
            if (!useAgentStore.getState().connected) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void postState(endpoint, token, clientIdRef.current, canvasContextRef.current?.snapshot || null), 300);
        });
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [endpoint, token]);

    useEffect(() => {
        if (!clientReady || !enabled || !token.trim()) return;
        localStorage.setItem("oioi-canvas-agent-url", endpoint);
        localStorage.setItem("oioi-canvas-agent-token", token);
        const clientId = clientIdRef.current;
        let disposed = false;
        let protocolRejected = false;
        const isCurrentConnection = () => !disposed && clientIdRef.current === clientId;
        const source = new EventSource(`${endpoint}/events?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`);
        source.addEventListener("hello", (event) => {
            if (!isCurrentConnection()) return;
            const hello = parseEventData<AgentHelloEvent>(event);
            if (hello?.protocolVersion !== AGENT_PROTOCOL_VERSION) {
                const text = rt("agentOutdated");
                protocolRejected = true;
                source.close();
                connectedRef.current = false;
                setAgentState({ enabled: false, connected: false, activity: rt("restartRequired"), connectError: text, silentConnect: false, fragmentBootstrap: false });
                if (!useAgentStore.getState().silentConnect) message.error(text);
                return;
            }
            errorLoggedRef.current = false;
            connectedRef.current = true;
            const silent = useAgentStore.getState().silentConnect;
            setAgentState({ connected: true, activity: rt("connected"), connectError: "", silentConnect: false, fragmentBootstrap: false });
            if (!silent) message.success(rt("localAgentConnected"));
            void postState(endpoint, token, clientId, canvasContextRef.current?.snapshot || null);
            if (document.visibilityState === "visible" && document.hasFocus()) void activateAgentClient(endpoint, token, clientId);
        });
        source.addEventListener("tool_call", (event) => {
            if (!isCurrentConnection()) return;
            const data = parseEventData<AgentPendingToolCall>(event);
            if (data) void runToolCall(endpoint, token, data, navigate, clientIdRef);
        });
        source.onerror = () => {
            if (disposed || protocolRejected) return;
            const wasConnected = connectedRef.current;
            const silent = useAgentStore.getState().silentConnect && !wasConnected;
            const text = rt(wasConnected ? "connectionLostDescription" : "connectionFailedDescription");
            if (!errorLoggedRef.current || wasConnected) {
                if (!silent) message.error(text);
            }
            errorLoggedRef.current = true;
            connectedRef.current = false;
            setAgentState({
                activity: rt(wasConnected ? "connectionLost" : "connectionFailed"),
                connected: false,
                connectError: silent ? "" : text,
                silentConnect: false,
                fragmentBootstrap: false,
            });
            if (!wasConnected) {
                source.close();
                setAgentState({ enabled: false });
            }
        };
        return () => {
            disposed = true;
            source.close();
            connectedRef.current = false;
        };
    }, [clientReady, enabled, endpoint, message, setAgentState, token, navigate]);

    useEffect(() => {
        if (!connected) return;
        const activate = () => void activateAgentClient(endpoint, token, clientIdRef.current);
        const activateVisible = () => {
            if (document.visibilityState === "visible") activate();
        };
        window.addEventListener("focus", activate);
        document.addEventListener("visibilitychange", activateVisible);
        return () => {
            window.removeEventListener("focus", activate);
            document.removeEventListener("visibilitychange", activateVisible);
        };
    }, [connected, endpoint, token]);

    const toggleAgentConnection = async ({ silent = false }: { silent?: boolean } = {}) => {
        if (enabled) {
            setAgentState({ enabled: false, connected: false, activity: rt("offline"), connectError: "", fragmentBootstrap: false, silentConnect: false });
            return;
        }
        const urlToken = searchParams.get("agentToken") || "";
        const urlEndpoint = searchParams.get("agentUrl") || "";
        const discovered = urlToken ? null : await discoverAgentConfig(endpoint || DEFAULT_AGENT_URL);
        const nextEndpoint = (urlEndpoint || discovered?.url || endpoint || DEFAULT_AGENT_URL).trim().replace(/\/$/, "");
        const nextToken = (urlToken || token.trim() || discovered?.token || "").trim();
        if (!nextEndpoint) {
            const text = rt("addressRequired");
            if (!silent) {
                setAgentState({ connectError: text });
                message.warning(text);
            }
            return;
        }
        if (!nextToken) {
            const text = rt("agentNotFound");
            if (!silent) {
                setAgentState({ connectError: text });
                message.warning(text);
            }
            return;
        }
        try {
            const parsed = new URL(nextEndpoint);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
        } catch {
            const text = rt("invalidAddress");
            if (!silent) {
                setAgentState({ connectError: text });
                message.warning(text);
            }
            return;
        }
        errorLoggedRef.current = false;
        setAgentState({ url: nextEndpoint, token: nextToken, enabled: true, connected: false, silentConnect: silent, fragmentBootstrap: false, activity: rt("connecting"), connectError: "" });
    };

    useLayoutEffect(() => {
        const bootstrap = readAgentUrlBootstrap(hash);
        if (!bootstrap) return;
        navigate(`${window.location.pathname}${window.location.search}${bootstrap.remainingHash}`, { replace: true });
        if (!bootstrap.url || !bootstrap.token) {
            setAgentState({ fragmentBootstrap: false, connectError: rt(!bootstrap.url ? "addressRequired" : "agentNotFound") });
            useAgentStore.getState().openPanel();
            return;
        }
        try {
            const parsed = new URL(bootstrap.url);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
        } catch {
            setAgentState({ fragmentBootstrap: false, connectError: rt("invalidAddress") });
            useAgentStore.getState().openPanel();
            return;
        }
        errorLoggedRef.current = false;
        setAgentState({ url: bootstrap.url.replace(/\/$/, ""), token: bootstrap.token, enabled: true, connected: false, silentConnect: true, fragmentBootstrap: true, activity: rt("connecting"), connectError: "" });
    }, [hash, navigate, setAgentState]);

    useEffect(() => {
        if (!urlAgentAutoConnect || autoConnectRef.current || enabled || connected) return;
        autoConnectRef.current = true;
        void toggleAgentConnection({ silent: true });
    }, [connected, enabled, urlAgentAutoConnect]);

    const connectionStatus = t(connectError ? "agent.status.failed" : connected ? "agent.status.connected" : enabled ? "agent.status.connecting" : "agent.status.disconnected");
    const connectionStatusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;

    if (!embedded) return null;
    return (
        <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 items-center gap-1">
                    <span className="grid size-8 place-items-center">
                        <Bot className="size-4" />
                    </span>
                    <div className="text-base font-semibold leading-5">{t("agent.connect.title")}</div>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4" style={{ color: connectionStatusColor }}>
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: connectionStatusColor }} />
                        <span className="truncate">{connectionStatus}</span>
                    </span>
                </div>
                <Tooltip title={t("agent.panel.collapse")}>
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" aria-label={t("agent.panel.collapseLabel")} style={{ color: theme.node.muted }} icon={<PanelRightClose className="size-4" />} onClick={closePanel} />
                </Tooltip>
            </div>
            <AgentConnectView
                theme={theme}
                url={url}
                token={token}
                enabled={enabled}
                connected={connected}
                activity={activity}
                connectError={connectError}
                onUrlChange={(value) => setAgentState({ url: value, connectError: "" })}
                onTokenChange={(value) => setAgentState({ token: value, connectError: "" })}
                onToggleEnabled={() => void toggleAgentConnection()}
            />
        </>
    );
}

async function runToolCall(
    endpoint: string,
    token: string,
    payload: AgentPendingToolCall,
    navigate: ReturnType<typeof useNavigate>,
    clientIdRef: { current: string },
) {
    if (isSiteTool(payload.name)) {
        try {
            const result = await runSiteTool(payload.name, payload.input || {}, navigate, { canvasSnapshot: useAgentStore.getState().canvasContext?.snapshot || null });
            await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, result });
        } catch (error) {
            const message = error instanceof Error ? error.message : rt("toolExecutionFailed");
            await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error: message });
        }
        return;
    }
    try {
        const input: { ops?: CanvasAgentOp[]; path?: string } = payload.input || {};
        let result: unknown;
        let appliedOps = input.ops || [];
        const context = useAgentStore.getState().canvasContext;
        if (payload.name === "site_navigate") {
            const path = input.path || "/";
            navigate(path);
            result = { ok: true, path };
        } else if (payload.name === "canvas_apply_ops") {
            if (!context) throw new Error(rt("openCanvasFirst"));
            result = context.applyOps(appliedOps);
            void postState(endpoint, token, clientIdRef.current, result as CanvasAgentSnapshot);
        } else if (payload.name === "canvas_create_attachment_nodes") {
            if (!context) throw new Error(rt("openCanvasFirst"));
            appliedOps = await attachmentNodeOps(endpoint, token, clientIdRef.current, payload.input?.nodes);
            result = context.applyOps(appliedOps);
            await postState(endpoint, token, clientIdRef.current, result as CanvasAgentSnapshot);
        } else {
            if (!context?.snapshot) throw new Error(rt("openCanvasFirst"));
            result = context.snapshot;
        }
        await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, result });
    } catch (error) {
        const message = error instanceof Error ? error.message : rt("canvasOperationFailed");
        await postToolResult(endpoint, token, clientIdRef.current, { requestId: payload.requestId, error: message });
    }
}

async function attachmentNodeOps(endpoint: string, token: string, clientId: string, value: unknown): Promise<CanvasAgentOp[]> {
    const nodes = Array.isArray(value) ? value : [];
    if (!nodes.length) throw new Error(rt("noImageAttachments"));
    return await Promise.all(
        nodes.map(async (value) => {
            const item = value as { id?: unknown; attachmentId?: unknown; title?: unknown; position?: unknown };
            const id = String(item.id || "");
            const attachmentId = String(item.attachmentId || "");
            if (!id || !attachmentId) throw new Error(rt("invalidAttachmentNode"));
            const res = await fetch(`${endpoint}/agent/attachments/${encodeURIComponent(attachmentId)}?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`);
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || rt("attachmentReadFailed"));
            }
            const image = await uploadImage(await res.blob());
            const size = fitNodeSize(image.width, image.height);
            const position = item.position && typeof item.position === "object" ? (item.position as { x?: unknown; y?: unknown }) : {};
            return {
                type: "add_node" as const,
                id,
                nodeType: "image" as const,
                title: String(item.title || rt("referenceImage")),
                position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
                width: size.width,
                height: size.height,
                metadata: imageMetadata(image),
            };
        }),
    );
}

function acquireAgentClientId() {
    const scope = globalThis as AgentClientGlobal;
    scope.__oioiCanvasAgentClientIdPromise ||= (async () => {
        const storedClientId = readAgentClientId();
        let clientId = storedClientId || randomId();
        if (!navigator.locks) {
            if (!storedClientId) saveAgentClientId(clientId);
            return clientId;
        }
        while (true) {
            const acquired = await new Promise<boolean>((resolve, reject) => {
                void navigator.locks.request(`oioi-canvas-agent:${clientId}`, { ifAvailable: true }, async (lock) => {
                    if (!lock) return resolve(false);
                    resolve(true);
                    await new Promise<void>(() => undefined);
                }).catch(reject);
            });
            if (acquired) {
                saveAgentClientId(clientId);
                return clientId;
            }
            clientId = randomId();
        }
    })().catch(() => {
        const clientId = randomId();
        saveAgentClientId(clientId);
        return clientId;
    });
    return scope.__oioiCanvasAgentClientIdPromise;
}

function readAgentClientId() {
    try {
        return sessionStorage.getItem("oioi-canvas-agent-client-id") || "";
    } catch {
        return "";
    }
}

function saveAgentClientId(clientId: string) {
    try {
        sessionStorage.setItem("oioi-canvas-agent-client-id", clientId);
    } catch {
        // Keep the in-memory identity for this page session even if sessionStorage is unavailable.
    }
}
