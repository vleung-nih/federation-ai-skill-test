const path = require("node:path");
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

function main() {
  const runFolderArg = process.argv[2];
  const runFolderPath = resolveRunFolder(runFolderArg);
  const projectRoot = process.cwd();
  const templatePath = resolveJudgeTemplatePath(projectRoot);
  const judgeTemplate = readFileSync(templatePath, "utf8");

  const caseFolders = listTestCaseFolders(runFolderPath);
  if (caseFolders.length === 0) {
    throw new Error(`No test case folders found in ${runFolderPath}`);
  }

  log.info(`Building judge prompts from run folder: ${runFolderPath}`);
  log.info(`Using template: ${path.basename(templatePath)}`);

  let builtCount = 0;
  for (const caseFolderPath of caseFolders) {
    const inputs = getCaseEvaluationInputs(caseFolderPath, judgeTemplate);
    writeJudgePrompt(inputs.promptPath, inputs.prompt);
    builtCount += 1;
    log.info(`Created ${path.basename(inputs.promptPath)} for ${inputs.caseName}`);
  }

  log.info(`Done. Built prompts for ${builtCount} test cases.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}
