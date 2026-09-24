export type ErrorReporter = (label: string, err: unknown) => void;
export declare function setReporter(fn: ErrorReporter | unknown): void;
export declare function report(label: string, err: unknown): void;
export declare function _reset(): void;
//# sourceMappingURL=reporter.d.ts.map