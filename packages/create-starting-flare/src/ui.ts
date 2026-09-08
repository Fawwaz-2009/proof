import chalk from "chalk";
import gradient from "gradient-string";
import * as p from "@clack/prompts";

const tty = process.stdout.isTTY === true;

const BOLT = `
      ▄█▄
      ▀███
       ▄███
     ▄████
      ▀███
       ▀▀▀`;

export const banner = (): void => {
  const flame = gradient(["#f97316", "#facc15"]);
  const brand = gradient(["#a78bfa", "#22d3ee"]);
  console.log(flame(BOLT));
  p.intro(`${brand("create-starting-flare")}  ${chalk.dim("from template to first light")}`);
};

export const outro = (message: string): void => p.outro(message);

export const info = (message: string): void => p.log.info(message);
export const warn = (message: string): void => p.log.warn(message);

/** Exits with the exact remediation. The one and only failure path. */
export const fail = (message: string): never => {
  p.log.error(message);
  p.outro(chalk.red("Aborted. Nothing was changed by the failing step."));
  process.exit(1);
};

export const cancelled = (): never => {
  p.cancel("Aborted.");
  process.exit(0);
};

/**
 * A phase is ONE line in the transcript: the label while working, the final
 * message after (set via ctx.done, defaulting to the label). On a terminal
 * the working line is a spinner that the final line replaces; without one
 * (agents, CI) the label and the final message are two plain log lines.
 */
export const phase = async <T>(label: string, run: (ctx: { message: (update: string) => void; done: (final: string) => void }) => Promise<T>): Promise<T> => {
  if (!tty) {
    p.log.step(label);
    let final = "";
    const result = await run({ message: () => {}, done: (m) => (final = m) });
    if (final.length > 0) p.log.message(final);
    return result;
  }
  const s = p.spinner();
  s.start(label);
  const started = Date.now();
  let doneMessage = "";
  try {
    const result = await run({
      message: (update) => s.message(update),
      done: (final) => (doneMessage = final),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    s.stop(`${doneMessage || label} ${chalk.dim(`(${seconds}s)`)}`, 0);
    return result;
  } catch (error) {
    s.stop(label, 1);
    throw error;
  }
};

/** A framed summary for the plan and the finish screen. */
export const summary = (title: string, rows: Array<[string, string]>, tail: Array<string> = []): void => {
  const body = [...rows.map(([k, v]) => `${chalk.dim(k.padEnd(8))} ${chalk.bold(v)}`), ...(tail.length > 0 ? ["", ...tail.map((l) => chalk.dim(l))] : [])].join("\n");
  p.note(body, title);
};
