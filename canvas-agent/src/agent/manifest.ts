import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

const entrySchema = z.object({ threadId: z.string(), cwd: z.string(), submissions: z.record(z.object({ status: z.enum(["sending", "accepted", "uncertain"]), turnId: z.string().optional() }).strict()) }).strict();
const legacySchema = z.object({ version: z.literal(1), conversations: z.record(entrySchema) }).strict();
const conversationSchema = entrySchema.extend({ title: z.string() });
const projectSchema = z.object({ activeId: z.string().uuid(), conversations: z.record(z.string().uuid(), conversationSchema) }).strict().refine((project) => Boolean(project.conversations[project.activeId]), "当前会话不存在");
const manifestSchema = z.object({ version: z.literal(2), projects: z.record(projectSchema) }).strict();
export type ConversationRecord = z.infer<typeof conversationSchema>;

/** 只保存原生会话映射与提交回执，不复制或裁剪聊天历史。未知/损坏版本拒绝覆盖。 */
export class ConversationManifest {
    private source: string | null;
    private data: z.infer<typeof manifestSchema>;
    constructor(private file: string) {
        this.source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        const parsed = this.source === null ? { version: 2, projects: {} } : JSON.parse(this.source);
        if (parsed.version === 1) {
            const legacy = legacySchema.parse(parsed);
            this.data = { version: 2, projects: Object.fromEntries(Object.entries(legacy.conversations).map(([key, record]) => {
                const id = crypto.randomUUID();
                return [key, { activeId: id, conversations: { [id]: { ...record, title: "" } } }];
            })) };
            this.backup();
            this.write(this.data);
        } else this.data = manifestSchema.parse(parsed);
    }
    get(key: string) {
        const project = this.data.projects[key];
        return project ? structuredClone(project) : undefined;
    }
    backup() {
        if (this.source === null) return;
        if (fs.readFileSync(this.file, "utf8") !== this.source) throw new Error("会话清单已被其他进程修改，拒绝备份和重建，请重启连接服务");
        fs.writeFileSync(`${this.file}.${crypto.randomUUID()}.bak`, this.source, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    set(key: string, id: string, value: ConversationRecord) {
        this.write({ ...this.data, projects: { ...this.data.projects, [key]: { activeId: id, conversations: { ...this.data.projects[key]?.conversations, [id]: value } } } });
    }
    private write(value: z.infer<typeof manifestSchema>) {
        const next = manifestSchema.parse(value);
        const current = fs.existsSync(this.file) ? fs.readFileSync(this.file, "utf8") : null;
        if (current !== this.source) throw new Error("会话清单已被其他进程修改，拒绝覆盖，请重启连接服务");
        const text = JSON.stringify(next, null, 2);
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
            fs.renameSync(temporary, this.file);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        this.source = text;
        this.data = next;
    }
}
