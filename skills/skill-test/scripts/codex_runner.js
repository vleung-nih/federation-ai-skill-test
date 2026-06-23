const { spawn, spawnSync } = require("node:child_process");
const { writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const log = {
  info: (msg, ...args) => console.log(`[INFO]  ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN]  ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
};

const VALID_SANDBOXES = new Set(["read-only", "danger-full-access"]);
const DEFAULT_SANDBOX = "danger-full-access";
const TEST_CASE_SANDBOX = "danger-full-access";

function resolveRunOptions(options = {}) {
  if (options.forTestCases) {
    if (options.sandbox && options.sandbox !== TEST_CASE_SANDBOX) {
      log.warn(
        `Ignoring sandbox=${options.sandbox} for test cases; read-only blocks live API (DNS). Using ${TEST_CASE_SANDBOX}.`
      );
    }
    return {
      sandbox: TEST_CASE_SANDBOX,
      cwd: options.cwd ?? process.cwd(),
    };
  }

  const sandbox = options.sandbox ?? DEFAULT_SANDBOX;
  if (!VALID_SANDBOXES.has(sandbox)) {
    throw new Error(`Invalid sandbox "${sandbox}". Use read-only or danger-full-access.`);
  }

  return {
    sandbox,
    cwd: options.cwd ?? process.cwd(),
  };
}

function buildCodexArgs(prompt, sandbox) {
  return [
    "-a",
    "never",
    "exec",
    "--ephemeral",
    "--json",
    "--sandbox",
    sandbox,
    prompt,
  ];
}

function runCodex(prompt, outJsonlPath, options = {}) {
  const { sandbox, cwd } = resolveRunOptions(options);
  log.info(`Starting codex run (sandbox=${sandbox}, cwd=${cwd})`);
  log.info(`Prompt: ${prompt}`);
  log.info(`Output path: ${outJsonlPath}`);
  const res = spawnSync("codex", buildCodexArgs(prompt, sandbox), {
    encoding: "utf8",
    cwd,
  });

  mkdirSync(path.dirname(outJsonlPath), { recursive: true });

  writeFileSync(outJsonlPath, res.stdout, "utf8");

  const exitCode = res.status ?? 1;
  if (exitCode !== 0) {
    log.error(`codex exited with code ${exitCode}`);
    if (res.stderr) log.error(`stderr: ${res.stderr}`);
  } else {
    log.info(`codex completed successfully (exit code ${exitCode})`);
    log.info(`Trace written to ${outJsonlPath}`);
  }

  return { exitCode, stderr: res.stderr };
}

function runCodexAsync(prompt, outJsonlPath, options = {}) {
  const { sandbox, cwd } = resolveRunOptions(options);
  log.info(`Starting codex run (sandbox=${sandbox}, cwd=${cwd})`);
  log.info(`Prompt: ${prompt}`);
  log.info(`Output path: ${outJsonlPath}`);

  return new Promise((resolve) => {
    const child = spawn("codex", buildCodexArgs(prompt, sandbox), {
      stdio: ["ignore", "pipe", "pipe"],
      cwd,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      log.error(`Failed to start codex process: ${error.message}`);
      resolve({ exitCode: 1, stderr: error.message });
    });

    child.on("close", (code) => {
      mkdirSync(path.dirname(outJsonlPath), { recursive: true });
      writeFileSync(outJsonlPath, stdout, "utf8");

      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        log.error(`codex exited with code ${exitCode}`);
        if (stderr) log.error(`stderr: ${stderr}`);
      } else {
        log.info(`codex completed successfully (exit code ${exitCode})`);
        log.info(`Trace written to ${outJsonlPath}`);
      }

      resolve({ exitCode, stderr });
    });
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--prompt") {
      args.prompt = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--out") {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--sandbox") {
      args.sandbox = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return args;
}

function printUsage() {
  console.log(
    'Usage: node codex_runner.js --prompt "your prompt" --out eval/20260101/case-1/output.jsonl [--sandbox danger-full-access|read-only]'
  );
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.prompt || !args.out) {
    printUsage();
    process.exit(1);
  }

  const result = runCodex(args.prompt, args.out, { sandbox: args.sandbox });
  process.exit(result.exitCode);
}

module.exports = {
  runCodex,
  runCodexAsync,
  VALID_SANDBOXES,
  DEFAULT_SANDBOX,
  TEST_CASE_SANDBOX,
};
