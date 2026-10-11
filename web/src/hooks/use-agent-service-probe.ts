import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ENDPOINT = "http://127.0.0.1:17371";
const PROBE_INTERVAL_MS = 5000;

export type AgentServiceStatus = "idle" | "checking" | "running" | "stopped" | "outdated";

type ProbeResult = { status: AgentServiceStatus; protocolVersion?: number };

/** 探测本机 Canvas Agent 服务是否在运行，并校验协议版本。 */
export function useAgentServiceProbe(endpoint: string, expectedProtocolVersion: number) {
    const [status, setStatus] = useState<AgentServiceStatus>("idle");
    const inFlightRef = useRef(false);

    const probe = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setStatus((current) => (current === "idle" ? "checking" : current));
        const result = await probeAgentService(endpoint, expectedProtocolVersion);
        inFlightRef.current = false;
        setStatus(result.status);
        return result;
    }, [endpoint, expectedProtocolVersion]);

    useEffect(() => {
        void probe();
        const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [probe]);

    return { status, probe };
}

async function probeAgentService(endpoint: string, expectedProtocolVersion: number): Promise<ProbeResult> {
    const base = endpoint.trim().replace(/\/$/, "") || DEFAULT_ENDPOINT;
    try {
        const response = await fetch(`${base}/config`, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) return { status: "stopped" };
        const data = (await response.json()) as { protocolVersion?: number };
        if (typeof data.protocolVersion === "number" && data.protocolVersion !== expectedProtocolVersion) return { status: "outdated", protocolVersion: data.protocolVersion };
        return { status: "running", protocolVersion: data.protocolVersion };
    } catch {
        return { status: "stopped" };
    }
}
