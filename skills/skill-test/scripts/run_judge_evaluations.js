const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  resolveRunFolder,
  resolveJudgeTemplatePath,
  readFileSync,
  listTestCaseFolders,
  getCaseEvaluationInputs,
  writeJudgePrompt,
} = require("./judge_utils");

const log = {
  info: (msg, ...args) => console.log(`[INFO]  ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
};

function runCodexJudge(prompt, schemaPath, evaluationPath) {
  return spawnSync(
    "codex",
    [
      "exec",
      prompt,
      "--output-schema",
      schemaPath,
      "-o",
      evaluationPath,
    ],
    { encoding: "utf8" }
  );
}

function main() {
  const runFolderArg = process.argv[2];
  const runFolderPath = resolveRunFolder(runFolderArg);
  const projectRoot = process.cwd();

  const templatePath = resolveJudgeTemplatePath(projectRoot);
  const judgeTemplate = readFileSync(templatePath, "utf8");
  const schemaCandidates = [
    path.join(projectRoot, "style-rubric.schema.json"),
    path.join(__dirname, "..", "reference", "style-rubric.schema.json"),
  ];
  const schemaPath = schemaCandidates.find((candidate) => require("node:fs").existsSync(candidate));
  if (!schemaPath) {
    throw new Error("Cannot find style-rubric.schema.json in project root or skill reference folder");
  }

  const caseFolders = listTestCaseFolders(runFolderPath);
  if (caseFolders.length === 0) {
    throw new Error(`No test case folders found in ${runFolderPath}`);
  }

  log.info(`Running judge evaluations from run folder: ${runFolderPath}`);
  log.info(`Using schema: ${path.basename(schemaPath)}`);

  let successCount = 0;
  let failureCount = 0;

  for (const caseFolderPath of caseFolders) {
    const inputs = getCaseEvaluationInputs(caseFolderPath, judgeTemplate);
    writeJudgePrompt(inputs.promptPath, inputs.prompt);

    log.info(`Evaluating ${inputs.caseName}`);
    const result = runCodexJudge(inputs.prompt, schemaPath, inputs.evaluationPath);
    const exitCode = result.status ?? 1;

    if (exitCode === 0) {
      successCount += 1;
      log.info(`Saved evaluation: ${inputs.evaluationPath}`);
      continue;
    }

    failureCount += 1;
    log.error(`Failed evaluating ${inputs.caseName}. Exit code: ${exitCode}`);
    if (result.stderr) {
      log.error(result.stderr.trim());
    }
  }

  log.info(`Done. success=${successCount}, failed=${failureCount}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}
