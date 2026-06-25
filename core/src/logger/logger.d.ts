export declare class Logger {
    private readonly accountUsername;
    private comments;
    constructor(accountUsername?: string);
    private getTimestamp;
    private getPrefix;
    private getStatsString;
    info(message: string): void;
    action(message: string): void;
    success(message: string): void;
    error(message: string): void;
    warn(message: string): void;
    debug(message: string): void;
    header(message: string): void;
    incrementComments(): void;
}
//# sourceMappingURL=logger.d.ts.map