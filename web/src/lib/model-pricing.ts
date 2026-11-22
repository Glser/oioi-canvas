import i18n from "@/i18n";
import type { NewApiModelPricing } from "@/services/api/newapi";
import type { AiConfig } from "@/stores/use-config-store";

export type ModelPriceSummary = { label: string; detail: string; groups?: string[]; inlineLines?: string[] };

/** 估算价最多保留 2 位小数，去掉尾零。 */
export function formatEstimatedPrice(value: number) {
    return Number(value.toFixed(2)).toString();
}

/** 从渠道配置中解析指定模型（支持 channelId::name 编码值）的计费声明。 */
export function resolveModelPricing(config: AiConfig, model: string): NewApiModelPricing | undefined {
    const index = model.indexOf("::");
    const name = index >= 0 ? model.slice(index + 2) : model;
    for (const channel of config.channels) {
        for (const entry of channel.models) {
            if (entry.name === name) return entry.pricing;
        }
    }
    return undefined;
}

type TierPricing = { label: string; perCall?: number; perSecond?: number; inputPerMillion?: number; outputPerMillion?: number; cacheReadPerMillion?: number; cacheWritePerMillion?: number };

/** 提取 `tier("标签", 表达式)` 分档；支持嵌套括号，无 tier 时整体作为单档。 */
function extractTiers(expr: string): Array<{ label: string; content: string }> {
    const tiers: Array<{ label: string; content: string }> = [];
    let index = 0;
    for (;;) {
        const start = expr.indexOf('tier("', index);
        if (start < 0) break;
        const labelStart = start + 6;
        const labelEnd = expr.indexOf('"', labelStart);
        if (labelEnd < 0) break;
        const label = expr.slice(labelStart, labelEnd);
        const comma = expr.indexOf(",", labelEnd);
        if (comma < 0) break;
        let cursor = comma + 1;
        while (cursor < expr.length && expr[cursor] === " ") cursor += 1;
        const contentStart = cursor;
        let depth = 1;
        while (cursor < expr.length && depth > 0) {
            if (expr[cursor] === "(") depth += 1;
            else if (expr[cursor] === ")") depth -= 1;
            cursor += 1;
        }
        tiers.push({ label, content: expr.slice(contentStart, depth === 0 ? cursor - 1 : cursor).trim() });
        index = cursor;
    }
    return tiers.length ? tiers : [{ label: "", content: expr }];
}

function parseTier(content: string): Partial<TierPricing> {
    const fixed = content.match(/fixed\(([\d.]+)\)/);
    if (fixed) return { perCall: Number(fixed[1]) };
    const second = content.match(/u\("seconds"\)\s*\*\s*([\d.]+)|([\d.]+)\s*\*\s*u\("seconds"\)/);
    if (second) return { perSecond: Number(second[1] || second[2]) };
    // 按次计费的视频模型：u("calls") * N（一次生成 = 一次调用）
    const call = content.match(/u\("calls"\)\s*\*\s*([\d.]+)|([\d.]+)\s*\*\s*u\("calls"\)/);
    if (call) return { perCall: Number(call[1] || call[2]) };
    const input = content.match(/(?:^|[^\w])p\s*\*\s*([\d.]+)/);
    const output = content.match(/(?:^|[^\w])c\s*\*\s*([\d.]+)/);
    const cacheRead = content.match(/(?:^|[^\w])cr\s*\*\s*([\d.]+)/);
    // 多档缓存写入（cc/cc1h/cc12h）取第一档价格
    const cacheWrite = content.match(/(?:^|[^\w])cc(?:1h|12h)?\s*\*\s*([\d.]+)/);
    if (input || output || cacheRead || cacheWrite) {
        return {
            inputPerMillion: input ? Number(input[1]) : undefined,
            outputPerMillion: output ? Number(output[1]) : input ? Number(input[1]) : undefined,
            cacheReadPerMillion: cacheRead ? Number(cacheRead[1]) : undefined,
            cacheWritePerMillion: cacheWrite ? Number(cacheWrite[1]) : undefined,
        };
    }
    return {};
}

function formatNumber(value: number) {
    return Number(value.toFixed(4)).toString();
}

/** 价格明细使用的分组列表：仅创作台 auto 候选分组与模型分组的交集（autoGroups 为空时回退全部 enable_groups）。 */
function detailGroups(pricing: NewApiModelPricing, autoGroups?: string[]): string[] {
    const enabled = (pricing.enableGroups || []).filter((group) => group !== "auto");
    return autoGroups?.length ? enabled.filter((group) => autoGroups.includes(group)) : enabled;
}

/** 单个分组下四项每百万 token 价，格式：输入 ¥x 输出 ¥x 缓存读取 ¥x 缓存写入 ¥x / M（未声明的项省略）。 */
function formatGroupPrices(base: TierPricing | undefined, ratio: number): string {
    if (!base || base.inputPerMillion == null) return "";
    const parts = [
        i18n.t("account.priceInput", { price: formatNumber(base.inputPerMillion * ratio) }),
        i18n.t("account.priceOutput", { price: formatNumber((base.outputPerMillion ?? base.inputPerMillion) * ratio) }),
    ];
    if (base.cacheReadPerMillion != null) parts.push(i18n.t("account.priceCacheRead", { price: formatNumber(base.cacheReadPerMillion * ratio) }));
    if (base.cacheWritePerMillion != null) parts.push(i18n.t("account.priceCacheWrite", { price: formatNumber(base.cacheWritePerMillion * ratio) }));
    return `${parts.join(" ")} / M`;
}

/** 聊天模型基础价乘以各分组系数；行内单组直接展示价格行，多组带分组名前缀，悬停明细同格式。 */
function groupPriceLines(base: TierPricing | undefined, groups: string[], groupRatios: Record<string, number>): { detail: string[]; inline: string[] } {
    const detail: string[] = [];
    const inline: string[] = [];
    for (const group of groups) {
        const ratio = groupRatios[group];
        if (ratio == null) continue;
        const line = formatGroupPrices(base, ratio);
        if (!line) continue;
        detail.push(`${group}(×${formatNumber(ratio)}): ${line}`);
        inline.push(groups.length > 1 ? `${group}: ${line}` : line);
    }
    return { detail, inline };
}

/** 把网关的计费声明转成一行价格标签；识别不了的退回 model_price / model_ratio 字段。 */
export function modelPriceSummary(pricing: NewApiModelPricing | undefined, groupRatios: Record<string, number> = {}, autoGroups?: string[]): ModelPriceSummary | null {
    if (!pricing) return null;
    const tiers = extractTiers(pricing.billingExpr || "")
        .map((tier) => ({ label: tier.label, ...parseTier(tier.content) }))
        .filter((tier) => tier.perCall != null || tier.perSecond != null || tier.inputPerMillion != null);

    if (tiers.length) {
        const seconds = tiers.filter((tier) => tier.perSecond != null).map((tier) => tier.perSecond!);
        if (seconds.length === tiers.length) {
            const min = Math.min(...seconds);
            const max = Math.max(...seconds);
            return {
                label: min === max ? i18n.t("account.pricePerSecond", { price: formatNumber(min) }) : i18n.t("account.pricePerSecondRange", { min: formatNumber(min), max: formatNumber(max) }),
                detail: tiers.map((tier) => `${tier.label}: ¥${formatNumber(tier.perSecond!)}/s`).join("；"),
            };
        }
        const first = tiers[0];
        const tokenBase = tiers.find((tier) => tier.inputPerMillion != null);
        if (first.perCall != null) {
            const { detail } = groupPriceLines(tokenBase, detailGroups(pricing, autoGroups), groupRatios);
            return {
                label: i18n.t("account.pricePerCall", { price: formatNumber(first.perCall) }),
                detail: [tiers.map((tier) => `${tier.label}: ¥${formatNumber(tier.perCall ?? 0)}`).join("；"), ...detail].filter(Boolean).join("\n"),
            };
        }
        if (first.inputPerMillion != null) {
            const groups = detailGroups(pricing, autoGroups);
            const { detail, inline } = groupPriceLines(tokenBase, groups, groupRatios);
            return {
                label: inline[0] || i18n.t("account.pricePerMillionShort", { input: formatNumber(first.inputPerMillion), output: formatNumber(first.outputPerMillion ?? first.inputPerMillion) }),
                detail: [detail.join("\n"), detail.length > 1 ? i18n.t("account.priceGroupsHint") : ""].filter(Boolean).join("\n"),
                inlineLines: inline,
                groups,
            };
        }
    }

    if (pricing.quotaType === 1 && typeof pricing.modelPrice === "number" && pricing.modelPrice > 0) {
        return { label: i18n.t("account.pricePerCall", { price: formatNumber(pricing.modelPrice) }) };
    }
    if (typeof pricing.modelRatio === "number" && pricing.modelRatio > 0) {
        return { label: i18n.t("account.priceRatio", { ratio: formatNumber(pricing.modelRatio) }) };
    }
    return null;
}

/** 视频分档计价的档位匹配：无条件单档直接取；条件式按选中分辨率 token 匹配（条件数比档位少 1 时末档为 else 兜底，带后缀 token 按前缀匹配限定档）。 */
function matchVideoTierRate(rates: number[], expr: string, resolution: string): number | null {
    const conditions = [...expr.matchAll(/u\("resolution"\)\s*==\s*"([^"]+)"/g)].map((match) => match[1]);
    if (!conditions.length) return rates.length === 1 ? rates[0] : null;
    const rateByResolution = new Map(conditions.map((token, index) => [token, rates[index]]));
    const fallback = conditions.length === rates.length - 1 ? rates[rates.length - 1] : undefined;
    const base = resolution.replace(/_.*$/, "");
    let rate = rateByResolution.get(resolution);
    if (rate == null && fallback != null && resolution === base) rate = fallback;
    if (rate == null && resolution !== base) for (const [condition, conditionRate] of rateByResolution) {
        if (conditionRate != null && condition.startsWith(base) && condition !== base) {
            rate = conditionRate;
            break;
        }
    }
    return rate ?? null;
}

/**
 * 按当前所选参数估算一次生成的价格（¥）。
 * 视频：`u("resolution") == "token" ? tier(档, u("seconds") * N) : ...` 按选中分辨率取每秒价 × 秒数，
 *       按次计费（`u("calls") * N`）取该档单价（一次生成 = 一次调用）；
 *       无条件单档（如 tier("720p", u("seconds") * 0.1)）直接用该档；无法定位档位时返回 null。
 * 图片：fixed(N) × 张数；无 billing_expr 时退回 model_price × 张数。
 */
export function estimateGenerationPrice(
    pricing: NewApiModelPricing | undefined,
    params: { kind: "video"; seconds: number; resolution?: string } | { kind: "image"; count: number },
): number | null {
    if (!pricing) return null;
    const expr = pricing.billingExpr || "";
    const tiers = extractTiers(expr).map((tier) => ({ label: tier.label, ...parseTier(tier.content) }));

    if (params.kind === "video") {
        // 按次计费（u("calls") * N）的视频模型：一次生成 = 一次调用，价格与时长无关
        const calls = tiers.filter((tier) => tier.perCall != null);
        if (calls.length && expr.includes('u("calls")')) return matchVideoTierRate(calls.map((tier) => tier.perCall!), expr, params.resolution || "");
        const perSecond = tiers.filter((tier) => tier.perSecond != null);
        if (!perSecond.length) return null;
        const rate = matchVideoTierRate(perSecond.map((tier) => tier.perSecond!), expr, params.resolution || "");
        return rate != null ? rate * params.seconds : null;
    }

    const fixed = tiers.find((tier) => tier.perCall != null);
    if (fixed) return fixed.perCall! * params.count;
    if (pricing.quotaType === 1 && typeof pricing.modelPrice === "number" && pricing.modelPrice > 0) return pricing.modelPrice * params.count;
    return null;
}
