import { useEffect, useState } from "react";
import { create } from "zustand";
import { Alert, Button, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useConfigStore } from "@/stores/use-config-store";

const STORAGE_KEY = "oioi-canvas:data-notice-ack";
const REMIND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const COUNTDOWN_SECONDS = 5;

// 手动入口（配置 → 本地存储 → 数据须知）和定时提醒共用一个弹窗状态
export const useDataNoticeStore = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
    open: false,
    show: () => set({ open: true }),
    hide: () => set({ open: false }),
}));

// 画布、素材和生成记录只存在浏览器本地；用须知提醒清理浏览器数据会丢失内容。
// 已配置 WebDAV 同步的用户不再自动打扰，但保留手动入口。首次进入延迟提示，之后每天提醒一次。
// 弹出后须阅读 5 秒才能确认，样式类似同意须知。
export function LocalDataNotice() {
    const { t } = useTranslation();
    const open = useDataNoticeStore((state) => state.open);
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        const acknowledgedAt = Number(localStorage.getItem(STORAGE_KEY)) || 0;
        if (acknowledgedAt && Date.now() - acknowledgedAt < REMIND_INTERVAL_MS) return;
        const webdav = useConfigStore.getState().webdav;
        if (webdav.url && webdav.username) return;
        const timer = window.setTimeout(() => useDataNoticeStore.getState().show(), 1200);
        return () => window.clearTimeout(timer);
    }, []);

    // 弹窗打开时启动确认倒计时，未读完不能确认或关闭
    useEffect(() => {
        if (!open) return;
        setCountdown(COUNTDOWN_SECONDS);
        const timer = window.setInterval(() => setCountdown((value) => (value <= 1 ? 0 : value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [open]);

    const acknowledge = () => {
        if (countdown > 0) return;
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        useDataNoticeStore.getState().hide();
    };

    return (
        <Modal
            title={t("dataNotice.title")}
            open={open}
            centered
            closable={countdown <= 0}
            keyboard={countdown <= 0}
            maskClosable={countdown <= 0}
            onCancel={acknowledge}
            footer={
                <Button type="primary" disabled={countdown > 0} onClick={acknowledge}>
                    {t(countdown > 0 ? "dataNotice.actionCountdown" : "dataNotice.action", { seconds: Math.max(countdown, 1) })}
                </Button>
            }
        >
            <Alert type="warning" showIcon title={t("dataNotice.description")} className="!mt-1" />
        </Modal>
    );
}
