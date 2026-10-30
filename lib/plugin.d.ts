import { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type MemoryConfig } from './config.js';
import { MemoryService } from './service.js';
export declare const name = "dsh_i_memory_format";
export interface PluginConfig extends Partial<MemoryConfig> {
    /** Optional JSONL location. No host-specific persistence is assumed by the format layer. */
    file?: string;
}
export declare const Config: Schema<PluginConfig>;
export declare function apply(ctx: Context, config?: PluginConfig): void;
export default apply;
declare module '@deepseek-ai/cordis' {
    interface Context {
        iMemory: MemoryService;
    }
}
//# sourceMappingURL=plugin.d.ts.map