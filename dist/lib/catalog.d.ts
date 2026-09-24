export type CatalogHost = "PROD" | "LOCAL" | string;
export type ErrorKind = "db_not_found_or_unshared" | "auth_denied" | "rate_limited" | "network" | "notion_5xx" | "unknown";
export interface CatalogConfig {
    /** Notion integration bearer token */
    token: string;
    /** Target DB ID (with or without dashes) */
    dbId: string;
    /** Project slug, e.g. "nexus", "framework" */
    project: string;
    /** "PROD" | "LOCAL" — project decides */
    host?: CatalogHost;
    /** Default "Asia/Ho_Chi_Minh" */
    tz?: string;
    /** Gating predicate (e.g. PROD-only). Default true. */
    enabled?: () => boolean;
    /** Optional Telegram alerter. Called once per error kind. */
    alertOnce?: (kind: ErrorKind, name: string, errMsg: string) => Promise<void> | void;
}
interface SyncRequest {
    name: string;
    cron: string;
    sourceFile?: string;
}
export declare function configure(opts: CatalogConfig): void;
export declare function isConfigured(): boolean;
export declare function _detectSourceFile(): string;
export declare function _classifyError(err: unknown): ErrorKind;
export declare function syncSchedulerToCatalog(req: SyncRequest): Promise<void>;
export declare function _reset(): void;
export {};
//# sourceMappingURL=catalog.d.ts.map