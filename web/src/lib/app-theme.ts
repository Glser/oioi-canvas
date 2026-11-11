import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(23, 23, 23, 0.06)",
        itemSelectedBg: "rgba(23, 23, 23, 0.1)",
        itemSelectedHoverBg: "rgba(23, 23, 23, 0.14)",
        itemText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        elevatedBg: "#1c1917",
        itemHoverBg: "rgba(250, 250, 249, 0.08)",
        itemSelectedBg: "rgba(250, 250, 249, 0.12)",
        itemSelectedHoverBg: "rgba(250, 250, 249, 0.16)",
        itemText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

const workbenchPalette = {
    dark: { background: "#1c1b19", surface: "#232220", elevated: "#33312e", text: "#e5e3df", secondary: "#b2b0aa", border: "#35332f", hover: "#2e2c29", selected: "#3b3934" },
    light: { background: "#f8f8f6", surface: "#ffffff", elevated: "#fdfdfb", text: "#282825", secondary: "#72726c", border: "#e8e8e3", hover: "#f3f3ef", selected: "#eaeae4" },
};

export function getTooltipConfig(dark: boolean) {
    const palette = workbenchPalette[dark ? "dark" : "light"];
    return { arrow: false, trigger: ["hover", "focus"] as ["hover", "focus"], styles: { container: { border: `1px solid ${palette.border}`, padding: "8px 12px", boxShadow: "0 4px 12px rgb(0 0 0 / 8%)" } } };
}

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;
    const palette = workbenchPalette[dark ? "dark" : "light"];

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "oioi-canvas-dark" : "oioi-canvas-light" },
        token: {
            fontFamily: "var(--font-sans)",
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
            borderRadius: 12,
            borderRadiusLG: 16,
            borderRadiusSM: 8,
            borderRadiusXS: 6,
        },
        components: {
            Tooltip: { colorBgSpotlight: palette.elevated, colorTextLightSolid: palette.text, borderRadius: 8, fontSize: 12 },
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: neutral.dark.itemSelectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}

// 创作工作台、内容管理与 Agent 共用的主题；画布保留自己的主题。
export function getWorkbenchAppearance(dark: boolean) {
    const palette = workbenchPalette[dark ? "dark" : "light"];
    const popupShadow = dark ? "0 0 0 1px #48453f, 0 12px 32px rgb(0 0 0 / 40%)" : "0 4px 16px rgb(0 0 0 / 8%)";
    const base = getAntThemeConfig(dark);
    const theme: ThemeConfig = {
        ...base,
        cssVar: { key: `workbench-${dark ? "dark" : "light"}` },
        token: {
            ...base.token,
            fontSize: 13,
            colorPrimary: palette.text,
            colorPrimaryHover: palette.secondary,
            colorPrimaryActive: palette.text,
            colorTextLightSolid: palette.background,
            colorText: palette.text,
            colorTextSecondary: palette.secondary,
            colorTextPlaceholder: palette.secondary,
            colorBgContainer: palette.surface,
            colorBgLayout: palette.background,
            colorBgElevated: palette.elevated,
            colorBorder: palette.border,
            colorBorderSecondary: palette.border,
            colorFillSecondary: palette.hover,
            colorFillTertiary: palette.hover,
            controlItemBgHover: palette.hover,
            controlItemBgActive: palette.selected,
            controlItemBgActiveHover: palette.selected,
            controlOutline: palette.border,
            borderRadius: 8,
            borderRadiusLG: 12,
            borderRadiusSM: 6,
            controlHeight: 36,
            boxShadowSecondary: popupShadow,
        },
        components: {
            ...base.components,
            Button: { primaryShadow: "none", defaultShadow: "none", fontWeight: 500, defaultHoverBorderColor: palette.border, defaultHoverColor: palette.text, defaultHoverBg: palette.hover },
            Select: { selectorBg: dark ? "#2a2825" : palette.surface, colorBgElevated: palette.elevated, optionActiveBg: dark ? "#403d37" : palette.hover, optionSelectedBg: dark ? "#4a463f" : palette.selected, optionSelectedColor: palette.text, activeBorderColor: palette.secondary, hoverBorderColor: palette.secondary },
            Slider: { railBg: palette.border, railHoverBg: palette.hover, trackBg: palette.secondary, trackHoverBg: palette.text, handleColor: palette.secondary, handleActiveColor: palette.text },
            Card: { colorBgContainer: palette.surface, colorBorderSecondary: palette.border },
            Tabs: { itemColor: palette.secondary, itemSelectedColor: palette.text, itemHoverColor: palette.text, inkBarColor: palette.text },
            Tag: { defaultBg: palette.hover, defaultColor: palette.secondary },
            Popover: { colorBgElevated: palette.elevated },
            Segmented: { trackBg: palette.hover, itemSelectedBg: dark ? palette.selected : palette.background, itemSelectedColor: palette.text, itemHoverBg: palette.border, itemColor: palette.secondary },
            Input: { activeBorderColor: palette.secondary, hoverBorderColor: palette.secondary, activeShadow: `0 0 0 2px ${palette.border}` },
            Modal: { contentBg: palette.surface, headerBg: palette.surface, footerBg: palette.surface, titleColor: palette.text, titleFontSize: 16 },
            Drawer: { colorBgElevated: palette.background, footerPaddingBlock: 16, footerPaddingInline: 20 },
        },
    };
    const style = {
        "--background": palette.background,
        "--foreground": palette.text,
        "--card": palette.surface,
        "--card-foreground": palette.text,
        "--popover": palette.elevated,
        "--popover-foreground": palette.text,
        "--muted": palette.hover,
        "--muted-foreground": palette.secondary,
        "--accent": palette.selected,
        "--accent-foreground": palette.text,
        "--border": palette.border,
        "--input": palette.border,
        "--ring": palette.secondary,
        "--wb-bg": palette.background,
        "--wb-nav-bg": dark ? "#282724" : "rgb(255 255 255 / 85%)",
        "--wb-nav-shadow": dark ? "0 2px 16px -6px rgb(0 0 0 / 40%)" : "0 2px 16px -6px rgb(0 0 0 / 8%)",
        "--wb-surface": palette.surface,
        "--wb-text": palette.text,
        "--wb-muted": palette.secondary,
        "--wb-border": palette.border,
        "--wb-hover": palette.hover,
        "--wb-selected": palette.selected,
        "--wb-tab-active": dark ? palette.selected : palette.background,
        fontFamily: "var(--font-sans)",
    } as CSSProperties;
    return {
        theme,
        style,
        modal: { styles: { root: style, container: { border: `1px solid ${palette.border}`, borderRadius: 16 } } },
        popover: { styles: { container: dark ? { boxShadow: popupShadow } : {} } },
        tooltip: getTooltipConfig(dark),
        drawer: { styles: { root: style, mask: { background: "rgb(0 0 0 / 10%)", backdropFilter: "blur(2px)" }, wrapper: { boxShadow: "none" }, section: { borderLeft: `1px solid ${palette.border}` }, header: { padding: "16px 20px" } } },
    };
}

export function isWorkbenchPath(pathname: string) {
    return ["/image", "/video", "/prompts", "/assets", "/config"].includes(pathname);
}
