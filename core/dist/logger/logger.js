"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const chalk_1 = __importDefault(require("chalk"));
class Logger {
    constructor(accountUsername = 'SYSTEM') {
        this.comments = 0;
        this.accountUsername = accountUsername;
    }
    getTimestamp() {
        return `[${new Date().toLocaleTimeString()}]`;
    }
    getPrefix() {
        return chalk_1.default.bold.cyan(`[${this.accountUsername}]`);
    }
    getStatsString() {
        const parts = [];
        if (this.comments > 0)
            parts.push(chalk_1.default.yellow(`Commented: ${chalk_1.default.bold(this.comments)}`));
        if (parts.length === 0)
            return '';
        return `| ${parts.join(' | ')}`;
    }
    info(message) {
        console.log(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${message} ${this.getStatsString()}`);
    }
    action(message) {
        console.log(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${chalk_1.default.blueBright(message)} ${this.getStatsString()}`);
    }
    success(message) {
        console.log(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${chalk_1.default.greenBright(message)} ${this.getStatsString()}`);
    }
    error(message) {
        console.error(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${chalk_1.default.redBright(message)} ${this.getStatsString()}`);
    }
    warn(message) {
        console.log(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${chalk_1.default.yellowBright(message)} ${this.getStatsString()}`);
    }
    debug(message) {
        console.log(`${chalk_1.default.gray(this.getTimestamp())} ${this.getPrefix()} ${chalk_1.default.gray.italic(message)}`);
    }
    header(message) {
        console.log(chalk_1.default.bold.magentaBright(`\n${message}`));
    }
    incrementComments() {
        this.comments++;
    }
}
exports.Logger = Logger;
