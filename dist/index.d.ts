import * as lock from "./lib/lock";
import type { ErrorReporter } from "./lib/reporter";
import type { StatusTracker } from "./lib/status";
import type { CatalogConfig } from "./lib/catalog";
export type WrappedJob = () => Promise<void>;
export type WrappedReportJob = (mode?: string) => Promise<void>;
/** Minimal cron adapter contract. Compatible with node-cron + similar libs. */
export interface CronAdapter {
    schedule(expression: string, fn: WrappedJob | WrappedReportJob, opts?: {
        timezone?: string;
    }): unknown;
}
export interface ConfigureOpts {
    reporter?: ErrorReporter;
    statusTracker?: StatusTracker;
    catalog?: CatalogConfig;
    cronAdapter?: CronAdapter;
}
export interface ScheduleJobOptions {
    timezone?: string;
    isReport?: boolean;
}
export declare function configure(opts?: ConfigureOpts): void;
export declare function createBackgroundJob(name: string, fn: () => Promise<void> | void): WrappedJob;
export declare function createReportJob(name: string, fn: (mode?: string) => Promise<void> | void): WrappedReportJob;
export declare function scheduleJob(name: string, schedule: string, fn: (mode?: string) => Promise<void> | void, options?: ScheduleJobOptions): unknown;
export declare const isReportRunning: typeof lock.isReportRunning;
//# sourceMappingURL=index.d.ts.map