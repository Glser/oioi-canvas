import { useCallback, useEffect, useRef, useState } from "react";

import { probeAgentService } from "@/services/api/canvas-agent";
const PROBE_INTERVAL_MS = 5000;

export type AgentServiceStatus = "idle" | "checking" | "running" | "stopped" | "outdated";

/** 探测本机 Canvas Agent 服务是否在运行，并校验协议版本。 */
export function useAgentServiceProbe(endpoint: string, expectedProtocolVersion: number) {
    const [state, setState] = useState<{ endpoint: string; status: AgentServiceStatus }>({ endpoint: "", status: "idle" });
    const inFlightRef = useRef(false);
    const endpointRef = useRef(endpoint);
    endpointRef.current = endpoint;

    const probe = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        const result = await probeAgentService(endpoint, expectedProtocolVersion);
        inFlightRef.current = false;
        if (endpointRef.current === endpoint) setState((current) => current.endpoint === endpoint && current.status === result.status ? current : { endpoint, status: result.status });
        return result;
    }, [endpoint, expectedProtocolVersion]);

    useEffect(() => {
        void probe();
        const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [probe]);

    return { status: state.endpoint === endpoint ? state.status : "checking" as AgentServiceStatus, probe };
}
