import { useCallback, useEffect, useRef, useState } from "react";

import { probeAgentService } from "@/services/api/canvas-agent";
const PROBE_INTERVAL_MS = 5000;

export type AgentServiceStatus = "idle" | "checking" | "running" | "stopped" | "outdated";

/** 探测本机 Canvas Agent 服务是否在运行，并校验协议版本；active 为 false 时不发任何请求。 */
export function useAgentServiceProbe(endpoint: string, expectedProtocolVersion: number, active: boolean) {
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
        if (!active) return;
        void probe();
        const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
        // 后台标签页定时器被节流，切回可见时立即补探一次，避免恢复连接/状态更新滞后一个轮询周期。
        const onVisible = () => { if (document.visibilityState === "visible") void probe(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [active, probe]);

    const status: AgentServiceStatus = !active ? "idle" : state.endpoint === endpoint ? state.status : "checking";
    return { status, probe };
}
