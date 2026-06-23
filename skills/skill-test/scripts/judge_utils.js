const path = require("node:path");
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require("node:fs");

function isDirectory(dirPath) {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveRunFolder(runFolderArg) {
  if (!runFolderArg) {
    throw new Error("Missing run folder argument. Example: node build_judge_prompts.js 20260617-222412");
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, runFolderArg),
    path.resolve(cwd, "eval", runFolderArg),
  ];

  if (path.isAbsolute(runFolderArg)) {
    candidates.unshift(runFolderArg);
  }

  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Run folder not found: ${runFolderArg}`);
}

function resolveJudgeTemplatePath(projectRoot) {
  const candidates = [
    path.join(projectRoot, "LLM_as_a_judge.prompt"),
    path.join(projectRoot, "LLM_as_a_Judge.prompt"),
    path.join(__dirname, "..", "reference", "LLM_as_a_judge.prompt"),
    path.join(__dirname, "..", "reference", "LLM_as_a_Judge.prompt"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Cannot find LLM_as_a_judge.prompt in project root or skill reference folder");
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readLastNonEmptyLines(filePath, count) {
  const text = readFileSync(filePath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.slice(-count);
}

function extractAgentMessageTextFromLastTwoLines(outputJsonlPath) {
  const lines = readLastNonEmptyLines(outputJsonlPath, 2);
  let errorMessage = null;
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj && obj.type === "item.completed" && obj.item && obj.item.type === "agent_message" && typeof obj.item.text === "string") {
      return obj.item.text;
    }

    if (obj && obj.type === "error" && typeof obj.message === "string") {
      errorMessage = obj.message;
    }

    if (obj && obj.type === "turn.failed" && obj.error && typeof obj.error.message === "string") {
      errorMessage = obj.error.message;
    }
  }

  if (errorMessage) {
    return errorMessage;
  }

  throw new Error(
    `Cannot find agent_message in last two non-empty lines of ${outputJsonlPath}`
  );
}

function buildJudgePrompt(template, data) {
  return template
    .replace("{{task}}", data.task)
    .replace("{{expected_output}}", data.expectedOutput)
    .replace("{{actual_output}}", data.actualOutput);
}

function listTestCaseFolders(runFolder) {
  return readdirSync(runFolder)
    .map((name) => path.join(runFolder, name))
    .filter((fullPath) => isDirectory(fullPath));
}

function getCaseEvaluationInputs(caseFolderPath, judgeTemplate) {
  const caseName = path.basename(caseFolderPath);
  const outputJsonlPath = path.join(caseFolderPath, "output.jsonl");
  const metaPath = path.join(caseFolderPath, "meta.json");

  if (!existsSync(outputJsonlPath)) {
    throw new Error(`Missing output.jsonl in ${caseFolderPath}`);
  }
  if (!existsSync(metaPath)) {
    throw new Error(`Missing meta.json in ${caseFolderPath}`);
  }

  const meta = readJsonFile(metaPath);
  const expectedOutput =
    typeof meta.expectedOutput === "string"
      ? meta.expectedOutput
      : typeof meta.expected_output === "string"
      ? meta.expected_output
      : null;

  if (typeof expectedOutput !== "string") {
    throw new Error(`Missing expectedOutput in ${metaPath}`);
  }

  const actualOutput = extractAgentMessageTextFromLastTwoLines(outputJsonlPath);
  const prompt = buildJudgePrompt(judgeTemplate, {
    task: caseName,
    expectedOutput,
    actualOutput,
  });

  return {
    caseName,
    caseFolderPath,
    prompt,
    outputJsonlPath,
    metaPath,
    evaluationPath: path.join(caseFolderPath, "evaluation.json"),
    promptPath: path.join(caseFolderPath, "judge_prompt.txt"),
  };
}

function writeJudgePrompt(promptPath, prompt) {
  writeFileSync(promptPath, prompt, "utf8");
}

module.exports = {
  resolveRunFolder,
  resolveJudgeTemplatePath,
  readFileSync,
  listTestCaseFolders,
  getCaseEvaluationInputs,
  writeJudgePrompt,
};
