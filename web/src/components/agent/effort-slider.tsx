import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Slider } from "radix-ui";
import i18n from "@/i18n";
import { createEffortMotion } from "./effort-slider-motion.js";
import styles from "./effort-slider.module.css";

type Props = {
    stops: { value: string; label: string }[];
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
};

export function EffortSlider({ stops, value, onValueChange, disabled }: Props) {
    const active = Math.max(0, stops.findIndex((stop) => stop.value === value));
    const max = Math.max(0, stops.length - 1);
    const [preview, setPreview] = useState(active);
    const [dragging, setDragging] = useState(false);
    const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const motion = useRef<ReturnType<typeof createEffortMotion> | null>(null);
    const previewRef = useRef(active);
    const gesture = useRef<{ id: number; startX: number; lastX: number; time: number; moved: boolean } | null>(null);
    const committed = useRef(value);
    const selected = Math.min(max, Math.max(0, Math.round(preview)));
    const ratio = max ? preview / max : 0;
    const updatePreview = (next: number) => {
        previewRef.current = Math.max(0, Math.min(max, next));
        setPreview(previewRef.current);
    };
    const commit = (next: number) => {
        if (disabled) return;
        const index = Math.max(0, Math.min(max, Math.round(next)));
        updatePreview(index);
        if (stops[index] && stops[index].value !== committed.current) {
            committed.current = stops[index].value;
            onValueChange(stops[index].value);
        }
    };
    const cancel = () => {
        gesture.current = null;
        setDragging(false);
        updatePreview(active);
        motion.current?.release();
    };
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        committed.current = value;
        gesture.current = null;
        setDragging(false);
        previewRef.current = active;
        setPreview(active);
        motion.current?.release();
    }, [value, active, max, disabled]);
    useLayoutEffect(() => {
        if (!root.current || !canvas.current) return;
        const controller = createEffortMotion(root.current, canvas.current, ratio, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        motion.current = controller;
        return () => { controller.dispose(); motion.current = null; };
    }, []);
    useLayoutEffect(() => { motion.current?.moveTo(ratio, dragging); }, [ratio, dragging]);
    useLayoutEffect(() => { motion.current?.setReducedMotion(reduced); }, [reduced]);

    return <div ref={root} className={styles.slider} data-dragging={dragging || undefined} data-maximum={selected === max || undefined} data-disabled={disabled || undefined}>
        <Slider.Root className={styles.input} min={0} max={Math.max(1, max)} step={0.001} value={[preview]} disabled={disabled || max === 0}
            onValueChange={([next]) => updatePreview(next)} onValueCommit={([next]) => commit(next)}
            onPointerDownCapture={(event) => {
                if (disabled || !max || !event.isPrimary || event.button !== 0) return;
                gesture.current = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, time: event.timeStamp, moved: false };
                motion.current?.press();
            }}
            onPointerMoveCapture={(event) => {
                const current = gesture.current;
                if (!current || current.id !== event.pointerId) return;
                if (!current.moved && Math.abs(event.clientX - current.startX) < 4) return;
                current.moved = true;
                setDragging(true);
                motion.current?.drag((event.clientX - current.lastX) / Math.max(8, event.timeStamp - current.time));
                current.lastX = event.clientX;
                current.time = event.timeStamp;
            }}
            onPointerUpCapture={(event) => {
                if (event.pointerId !== gesture.current?.id) return;
                gesture.current = null;
                setDragging(false);
                updatePreview(Math.round(previewRef.current));
                motion.current?.release();
            }}
            onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}
            onKeyDownCapture={(event) => {
                let next = selected;
                if (["ArrowRight", "ArrowUp", "PageUp"].includes(event.key)) next++;
                else if (["ArrowLeft", "ArrowDown", "PageDown"].includes(event.key)) next--;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = max;
                else return;
                event.preventDefault();
                event.stopPropagation();
                commit(next);
            }}>
            <Slider.Track className={styles.track}>
                <div className={styles.fill} aria-hidden="true"><canvas ref={canvas} /></div>
                <div className={styles.dots} aria-hidden="true">{stops.map((stop) => <span key={stop.value} />)}</div>
                <span className={styles.thumb} aria-hidden="true" />
            </Slider.Track>
            <Slider.Thumb className={styles.inputThumb} aria-label={i18n.t("settingsPanels.text.reasoning")} aria-valuemin={0} aria-valuemax={max} aria-valuenow={selected} aria-valuetext={stops[selected]?.label} />
        </Slider.Root>
        <div className={styles.stops} style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` } as CSSProperties}>
            {stops.map((stop, index) => <button key={stop.value} type="button" disabled={disabled} aria-pressed={selected === index} onClick={() => commit(index)}>{stop.label}</button>)}
        </div>
    </div>;
}
