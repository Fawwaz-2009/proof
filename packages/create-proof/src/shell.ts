/** Minimal subprocess helper: captured output, exit-code check. */
export type Run = { ok: boolean; stdout: string; stderr: string };

export const run = (cmd: string, args: Array<string>, opts: { cwd?: string; env?: Record<string, string> } = {}): Run => {
  const r = Bun.spawnSync([cmd, ...args], {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: r.exitCode === 0,
    stdout: new TextDecoder().decode(r.stdout).trim(),
    stderr: new TextDecoder().decode(r.stderr).trim(),
  };
};
