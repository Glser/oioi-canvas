import i18n from "@/i18n";
import type { NewApiModelPricing } from "@/services/api/newapi";
import type { AiConfig } from "@/stores/use-config-store";

export type ModelPriceSummary = { label: string; detail: string; groups?: string[] };

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

type TierPricing = { label: string; perCall?: number; perSecond?: number; inputPerMillion?: number; outputPerMillion?: number };

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
    const input = content.match(/(?:^|[^\w])p\s*\*\s*([\d.]+)/);
    const output = content.match(/(?:^|[^\w])c\s*\*\s*([\d.]+)/);
    if (input || output) return { inputPerMillion: input ? Number(input[1]) : undefined, outputPerMillion: output ? Number(output[1]) : input ? Number(input[1]) : undefined };
    return {};
}

function formatNumber(value: number) {
    return Number(value.toFixed(4)).toString();
}

/** 聊天模型的输入/输出基准价乘以各分组系数，得到该分组下的每百万 token 价。 */
function groupPriceLines(pricing: NewApiModelPricing, tiers: TierPricing[], groupRatios: Record<string, number>): string[] {
    const groups = (pricing.enableGroups || []).filter((group) => group !== "auto");
    if (!groups.length) return [];
    // 取第一个含输入价的档位作为基准（多档如 standard/long_context 显示在明细里，分组行用基准档）。
    const base = tiers.find((tier) => tier.inputPerMillion != null);
    if (!base || base.inputPerMillion == null) return [];
    const lines: string[] = [];
    for (const group of groups) {
        const ratio = groupRatios[group];
        if (ratio == null) continue;
        const input = base.inputPerMillion * ratio;
        const output = (base.outputPerMillion ?? base.inputPerMillion) * ratio;
        lines.push(`${group}(×${formatNumber(ratio)}): ${i18n.t("account.pricePerMillion", { input: formatNumber(input), output: formatNumber(output) })}`);
    }
    return lines;
}

/** 把网关的计费声明转成一行价格标签；识别不了的退回 model_price / model_ratio 字段。 */
export function modelPriceSummary(pricing: NewApiModelPricing | undefined, groupRatios: Record<string, number> = {}): ModelPriceSummary | null {
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
        if (first.perCall != null) {
            const groupLines = groupPriceLines(pricing, tiers, groupRatios);
            return {
                label: i18n.t("account.pricePerCall", { price: formatNumber(first.perCall) }),
                detail: [tiers.map((tier) => `${tier.label}: ¥${formatNumber(tier.perCall ?? 0)}`).join("；"), ...groupLines].filter(Boolean).join("\n"),
            };
        }
        if (first.inputPerMillion != null) {
            const groupLines = groupPriceLines(pricing, tiers, groupRatios);
            return {
                label: i18n.t("account.pricePerMillionShort", { input: formatNumber(first.inputPerMillion), output: formatNumber(first.outputPerMillion ?? first.inputPerMillion) }),
                detail: groupLines.join("\n"),
                groups: (pricing.enableGroups || []).filter((group) => group !== "auto"),
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

/**
 * 按当前所选参数估算一次生成的价格（¥）。
 * 视频：`u("resolution") == "token" ? tier(档, u("seconds") * N) : ...` 按选中分辨率取每秒价 × 秒数，
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
        const perSecond = tiers.filter((tier) => tier.perSecond != null);
        if (!perSecond.length) return null;
        const conditions = [...expr.matchAll(/u\("resolution"\)\s*==\s*"([^"]+)"/g)].map((match) => match[1]);
        if (!conditions.length) return perSecond.length === 1 ? perSecond[0].perSecond! * params.seconds : null;
        const rateByResolution = new Map(conditions.map((token, index) => [token, perSecond[index]?.perSecond]));
        // 条件数比档位少 1 时最后一个是 else 兜底档（如 720p 原画）
        const fallback = conditions.length === perSecond.length - 1 ? perSecond[perSecond.length - 1].perSecond! : undefined;
        const token = params.resolution || "";
        const base = token.replace(/_.*$/, "");
        let rate = rateByResolution.get(token);
        // 裸分辨率（720p）命中 else 兜底档（原画），带后缀（720p_upscaled）按前缀匹配限定档（如 720p超分）
        if (rate == null && fallback != null && token === base) rate = fallback;
        if (rate == null && token !== base) for (const [condition, conditionRate] of rateByResolution) {
            if (conditionRate != null && condition.startsWith(base) && condition !== base) {
                rate = conditionRate;
                break;
            }
        }
        return rate != null ? rate * params.seconds : null;
    }

    const fixed = tiers.find((tier) => tier.perCall != null);
    if (fixed) return fixed.perCall! * params.count;
    if (pricing.quotaType === 1 && typeof pricing.modelPrice === "number" && pricing.modelPrice > 0) return pricing.modelPrice * params.count;
    return null;
}
