const path = require("node:path");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const XLSX = require("xlsx");
const { runCodexAsync, TEST_CASE_SANDBOX } = require("./codex_runner");

const log = {
  info: (msg, ...args) => console.log(`[INFO]  ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN]  ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
};

function timestampForDir(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g, "_");
}

function findColumnName(row, candidates) {
  const entries = Object.keys(row).map((k) => ({ raw: k, normalized: normalizeKey(k) }));
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    const match = entries.find((entry) => entry.normalized === target);
    if (match) {
      return match.raw;
    }
  }
  return null;
}

function sanitizePathSegment(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").trim() || "unknown";
}

function parseBool(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isContentFilterBlock(tracePath) {
  try {
    const text = readFileSync(tracePath, "utf8");
    return text.includes('"type":"error"') && text.includes("flagged for possible cybersecurity risk");
  } catch {
    return false;
  }
}

function resolveExcelPath(argvPath) {
  if (argvPath) {
    return path.resolve(process.cwd(), argvPath);
  }

  const defaultCandidates = ["test_cases.xlsx", "test_case.xlsx"];
  for (const candidate of defaultCandidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(process.cwd(), "test_cases.xlsx");
}

function deriveExecutionStatus(exitCode, blockedByContentFilter) {
  if (blockedByContentFilter) {
    return "content_filter";
  }
  if (exitCode === 0) {
    return "completed";
  }
  return "failed";
}

function parseArgs(argv) {
  let excelPath;
  let concurrency = 1;
  let failFast = false;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fail-fast") {
      failFast = true;
      continue;
    }
    if (token === "--concurrency" || token === "-c") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("Invalid concurrency value. Use an integer >= 1.");
      }
      concurrency = value;
      i += 1;
      continue;
    }

    if (token === "--file" || token === "-f") {
      excelPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (!token.startsWith("-") && !excelPath) {
      excelPath = token;
    }
  }

  return { excelPath, concurrency, failFast };
}

async function runWithConcurrency(items, concurrency, workerFn) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        break;
      }
      results[index] = await workerFn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function runFromExcel(excelPath, options = {}) {
  const concurrency = options.concurrency ?? 1;
  const failFast = options.failFast ?? false;
  const resolvedExcelPath = resolveExcelPath(excelPath);
  if (!existsSync(resolvedExcelPath)) {
    throw new Error(`Excel file not found: ${resolvedExcelPath}`);
  }

  log.info(`Reading test cases from ${resolvedExcelPath}`);
  const workbook = XLSX.readFile(resolvedExcelPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel file has no sheets");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) {
    throw new Error("Excel sheet is empty");
  }

  const idColumn = findColumnName(rows[0], ["id", "test_id", "case_id"]);
  const promptColumn = findColumnName(rows[0], ["prompt", "input", "question"]);
  const expectedOutputColumn = findColumnName(rows[0], [
    "expected_output",
    "expected output",
    "expected",
    "expected_answer",
    "expected answer",
  ]);
  const requiresLiveApiColumn = findColumnName(rows[0], ["requires_live_api", "requires live api"]);

  if (!idColumn || !promptColumn) {
    throw new Error(
      `Required columns not found. Found columns: ${Object.keys(rows[0]).join(", ")}. Need columns for id and prompt.`
    );
  }

  const timestamp = timestampForDir();
  const runRoot = path.join(process.cwd(), "eval", timestamp);
  mkdirSync(runRoot, { recursive: true });

  let successCount = 0;
  let failureCount = 0;
  let contentFilterCount = 0;
  let skippedCount = 0;
  const idCount = new Map();
  const cases = [];

  for (const row of rows) {
    const rawId = row[idColumn];
    const rawPrompt = row[promptColumn];

    if (!rawId || !rawPrompt) {
      log.warn("Skipping row with missing id or prompt", row);
      skippedCount += 1;
      continue;
    }

    const baseId = sanitizePathSegment(rawId);
    const currentCount = (idCount.get(baseId) || 0) + 1;
    idCount.set(baseId, currentCount);

    const id = currentCount > 1 ? `${baseId}__${currentCount}` : baseId;
    const prompt = String(rawPrompt).trim();
    if (!prompt) {
      log.warn(`Skipping id=${id} because prompt is empty after trim`);
      skippedCount += 1;
      continue;
    }

    const caseDir = path.join(runRoot, id);
    mkdirSync(caseDir, { recursive: true });

    const tracePath = path.join(caseDir, "output.jsonl");
    const metaPath = path.join(caseDir, "meta.json");

    const expectedOutput = expectedOutputColumn ? String(row[expectedOutputColumn] ?? "") : "";
    const requiresLiveApi = requiresLiveApiColumn ? parseBool(row[requiresLiveApiColumn]) : false;

    cases.push({
      id,
      prompt,
      expectedOutput,
      requiresLiveApi,
      tracePath,
      metaPath,
      timestamp,
    });
  }

  log.info(`Starting run with concurrency=${concurrency}, queuedCases=${cases.length}, skippedRows=${skippedCount}`);

  await runWithConcurrency(cases, concurrency, async (testCase) => {
    const {
      id,
      prompt,
      expectedOutput,
      requiresLiveApi,
      tracePath,
      metaPath,
      timestamp: caseTimestamp,
    } = testCase;
    log.info(`Running test case id=${id} (sandbox=${TEST_CASE_SANDBOX})`);
    const result = await runCodexAsync(prompt, tracePath, {
      forTestCases: true,
      cwd: process.cwd(),
    });
    const blockedByContentFilter = result.exitCode !== 0 && isContentFilterBlock(tracePath);
    const executionStatus = deriveExecutionStatus(result.exitCode, blockedByContentFilter);

    const meta = {
      id,
      prompt,
      expectedOutput,
      requiresLiveApi,
      sandbox: TEST_CASE_SANDBOX,
      exitCode: result.exitCode,
      blockedByContentFilter,
      executionStatus,
      stderr: result.stderr || "",
      outputPath: tracePath,
      timestamp: caseTimestamp,
    };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

    if (result.exitCode === 0 || blockedByContentFilter) {
      successCount += 1;
      if (blockedByContentFilter) {
        contentFilterCount += 1;
        log.warn(`Content filter blocked test case id=${id}; preserving block message for judge evaluation`);
      }
    } else {
      failureCount += 1;
      log.error(`Failed test case id=${id} (exit code ${result.exitCode})`);
    }
  });

  const execution = {
    timestamp,
    runRoot,
    successCount,
    failureCount,
    contentFilterCount,
    skippedCount,
    queuedCases: cases.length,
    concurrency,
    totalRows: rows.length,
  };
  const summary = {
    timestamp,
    execution,
  };
  writeFileSync(path.join(runRoot, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  log.info(
    `Finished run. totalRows=${execution.totalRows}, success=${execution.successCount}, failed=${execution.failureCount}`
  );

  if (failureCount > 0) {
    if (failFast) {
      throw new Error(`One or more Codex executions failed (${failureCount}/${cases.length})`);
    }
    log.warn(
      `${failureCount} case(s) failed execution; continuing (judge and dashboard can still run). Use --fail-fast to abort.`
    );
  }

  return summary;
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv);
      await runFromExcel(args.excelPath, {
        concurrency: args.concurrency,
        failFast: args.failFast,
      });
    } catch (error) {
      log.error(error.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  runFromExcel,
  deriveExecutionStatus,
  parseArgs,
};
