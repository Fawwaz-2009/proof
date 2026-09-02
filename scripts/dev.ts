// Developer stage lifecycle: `bun run dev` starts (or reuses) the current
// developer's isolated stage; parallel developers isolate by STAGE. Destroy
// and reset are explicit and destructive to that stage only.
const action = process.argv[2] ?? "start";
const developer = (process.argv[3] ?? process.env.SUFRA_DEVELOPER ?? process.env.USER ?? "developer")
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
const stage = `dev_${developer || "developer"}`;

const run = async (command: ReadonlyArray<string>) => {
  const subprocess = Bun.spawn(command, { env: process.env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exitCode = await subprocess.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${exitCode}`);
};

switch (action) {
  case "start":
    await run(["bunx", "alchemy", "dev", "--stage", stage]);
    break;
  case "destroy":
    await run(["bunx", "alchemy", "destroy", "--stage", stage, "--yes"]);
    break;
  case "reset":
    await run(["bunx", "alchemy", "destroy", "--stage", stage, "--yes"]);
    await run(["bunx", "alchemy", "dev", "--stage", stage]);
    break;
  default:
    throw new Error("Expected one of: start, destroy, reset");
}
