import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useThemeStore } from "@/stores/use-theme-store";
import styles from "../image-results.module.css";

export function GenerationLoading() {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const theme = useThemeStore((state) => state.theme);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const color = getComputedStyle(canvas).getPropertyValue("--wb-muted").trim();
        let width = 0;
        let height = 0;
        let frame = 0;
        let visible = true;
        const started = performance.now();

        const draw = (now: number) => {
            context.clearRect(0, 0, width, height);
            context.fillStyle = color;
            const time = motion.matches ? 1 : (now - started) / 1000;
            const centerX = width / 2;
            const centerY = (height - 28) / 2;
            const radius = Math.hypot(centerX, centerY);
            for (let y = 12; y < height - 36; y += 9) {
                for (let x = 12; x < width - 8; x += 9) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const distance = Math.hypot(dx, dy);
                    const phase = distance / 23 - time * 2.2;
                    const wave = ((Math.sin(phase) + 1) / 2) ** 6;
                    const fade = Math.max(0, 1 - (distance / radius) ** 2);
                    const shift = Math.cos(phase) * 1.4;
                    context.globalAlpha = (0.035 + wave * 0.85) * fade;
                    context.beginPath();
                    context.arc(x + dx / (distance || 1) * shift, y + dy / (distance || 1) * shift, 0.55 + wave * 0.65, 0, Math.PI * 2);
                    context.fill();
                }
            }
            if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
        };
        const refresh = () => {
            cancelAnimationFrame(frame);
            if (visible && !document.hidden) draw(performance.now());
        };
        const resize = new ResizeObserver(([entry]) => {
            width = entry.contentRect.width;
            height = entry.contentRect.height;
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            refresh();
        });
        const intersection = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            refresh();
        });
        resize.observe(canvas);
        intersection.observe(canvas);
        motion.addEventListener("change", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            intersection.disconnect();
            motion.removeEventListener("change", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [theme]);

    return (
        <div className={`${styles.loading} ${styles.placeholder}`} role="status" aria-label={t("workbench.generating")}>
            <canvas ref={canvasRef} aria-hidden="true" />
            <span className={styles.loadingLabel} aria-hidden="true">{t("workbench.generating")}</span>
        </div>
    );
}
