export function electronSpawnEnv(extra = {}) {
    const env = { ...process.env, ...extra };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
}
