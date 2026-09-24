export type JobStatus = "running" | "done" | "failed" | "skipped";
export type StatusTracker = (name: string, status: JobStatus, durationMs?: number) => void;
export declare function setTracker(fn: StatusTracker | unknown): void;
export declare function track(name: string, status: JobStatus, durationMs?: number): void;
export declare function _reset(): void;
//# sourceMappingURL=status.d.ts.map