import { EventEmitter } from 'events';

export class UiLogger {
    constructor(
        private readonly accountUsername: string,
        private readonly emitter: EventEmitter
    ) {}

    private emit(level: string, message: string): void {
        this.emitter.emit('bot:log', {
            level,
            message,
            account: this.accountUsername,
            at: new Date().toISOString(),
        });
    }

    info(message: string): void {
        this.emit('info', message);
    }
    action(message: string): void {
        this.emit('action', message);
    }
    success(message: string): void {
        this.emit('success', message);
    }
    error(message: string): void {
        this.emit('error', message);
    }
    warn(message: string): void {
        this.emit('warn', message);
    }
    debug(message: string): void {
        this.emit('debug', message);
    }
    header(message: string): void {
        this.emit('header', message);
    }
    incrementComments(): void {
        /* stats tracked via comment events */
    }
}
