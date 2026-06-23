#!/usr/bin/env node

/**
 * LLM Evaluation Pipeline Orchestrator
 * 
 * Full workflow: Excel → Test Execution → Judge Generation → Evaluation → Dashboard
 * 
 * Features:
 * - Fail-fast error handling (stops on first stage failure)
 * - Automatic browser opening on success
 * - Output folder structure display
 * - Summary metrics reporting
 * 
 * Usage:
 *   node llm_eval_pipeline.js [excelPath] [--concurrency N]
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { existsSync, readdirSync, statSync } = require("node:fs");

const log = {
  info: (msg, ...args) => console.log(`[INFO]  ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN]  ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  section: (title) => {
    console.log("\n" + "=".repeat(70));
    console.log(`  ${title}`);
    console.log("=".repeat(70));
  },
};

function parseArgs(argv) {
  let excelPath;
  let concurrency = 1;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    
    if (token === "--concurrency" || token === "-c") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("Invalid concurrency value. Use an integer >= 1.");
      }
      concurrency = value;
      i += 1;
      continue;
    }

    if (!token.startsWith("-") && !excelPath) {
      excelPath = token;
    }
  }

  return { excelPath, concurrency };
}

function resolveProjectRoot() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "skills", "skill-test", "scripts"))) {
    return cwd;
  }

  if (existsSync(path.join(cwd, ".git"))) {
    return cwd;
  }

  if (existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }

  // Fallback when invoked outside repo root.
  return path.resolve(__dirname, "../../../../");
}

function assertTrustedProjectRoot(root) {
  if (process.env.SKILL_TEST_SKIP_GIT_CHECK === "1") {
    log.warn("SKILL_TEST_SKIP_GIT_CHECK=1 — skipping git-root trust check");
    return;
  }

  const codexRunnerPath = path.join(root, "skills", "skill-test", "scripts", "codex_runner.js");
  const gitDir = path.join(root, ".git");

  if (!existsSync(codexRunnerPath)) {
    throw new Error(
      `Run from the agentskills git repo root (must contain skills/skill-test/scripts/codex_runner.js). ` +
        `Current root: ${root}. Do not copy skill-test into work/ or other disposable folders.`
    );
  }

  if (!existsSync(gitDir)) {
    throw new Error(
      `Run from the agentskills git repo root (must contain .git). ` +
        `Current root: ${root}. Do not copy skill-test into work/ — copies bypass sandbox fixes.`
    );
  }
}

function runStage(label, command, args, options = {}) {
  log.section(label);
  log.info(`Running: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    log.error(`${label} failed with exit code ${result.status}`);
    if (result.stderr) {
      log.error(result.stderr);
    }
    // Fail-fast: exit immediately on stage failure
    process.exit(result.status || 1);
  }

  log.info(`${label} completed successfully`);
  return true;
}

function openBrowser(url) {
  /**
   * Open URL in default browser (cross-platform)
   */
  const { exec } = require("node:child_process");
  
  let command;
  if (process.platform === "darwin") {
    command = `open "${url}"`;
  } else if (process.platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    // Linux
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      log.warn(`Could not open browser: ${err.message}`);
      log.info(`Dashboard available at: ${url}`);
    } else {
      log.info("Dashboard opened in browser ✓");
    }
  });
}

function displayFolderStructure(runFolderPath) {
  /**
   * Recursively display folder structure
   */
  const indent = (depth) => "  ".repeat(depth);

  function walkDir(dirPath, depth = 0) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        const icon = isDir ? "📁" : "📄";

        console.log(`${indent(depth)}${icon} ${entry.name}`);

        if (isDir && depth < 3) {
          walkDir(fullPath, depth + 1);
        }
      }
    } catch (err) {
      log.warn(`Could not read directory: ${err.message}`);
    }
  }

  console.log("\n📊 Output Folder Structure:");
  console.log(`${indent(0)}📁 eval/${path.basename(runFolderPath)}/`);
  walkDir(runFolderPath, 1);
}

function summarizeResults(runFolderPath) {
  /**
   * Read and display summary.json if available
   */
  try {
    const summaryPath = path.join(runFolderPath, "summary.json");
    if (existsSync(summaryPath)) {
      const summary = JSON.parse(require("node:fs").readFileSync(summaryPath, "utf8"));
      
      console.log("\n📈 Summary Metrics:");
      console.log(`   Total test cases: ${summary.total_cases ?? "N/A"}`);
      console.log(`   Passed: ${summary.passed ?? "N/A"}`);
      console.log(`   Failed: ${summary.failed ?? "N/A"}`);
      if (summary.average_score !== undefined) {
        console.log(`   Average score: ${(summary.average_score * 100).toFixed(1)}%`);
      }
      if (summary.elapsed_seconds !== undefined) {
        console.log(`   Elapsed time: ${summary.elapsed_seconds}s`);
      }
    }
  } catch (err) {
    // Summary not available, skip
  }
}

function extractRunFolder(projectRoot) {
  /**
   * Extract the run folder from test_case_runner output.
   * test_case_runner creates eval/{timestamp}/ folders.
   * We'll use the most recent one based on the execution.
   */
  const evalDir = path.join(projectRoot, "eval");
  if (!existsSync(evalDir)) {
    throw new Error("eval/ directory not created. test_case_runner may have failed.");
  }

  // Get most recent folder
  const folders = readdirSync(evalDir)
    .filter((f) => statSync(path.join(evalDir, f)).isDirectory())
    .sort()
    .reverse();

  if (folders.length === 0) {
    throw new Error("No run folders found in eval/");
  }

  return folders[0];
}

async function main() {
  const startTime = Date.now();

  try {
    const { excelPath, concurrency } = parseArgs(process.argv);
    const projectRoot = resolveProjectRoot();
    assertTrustedProjectRoot(projectRoot);
    const scriptsDir = __dirname;
    const stageScripts = {
      testCaseRunner: path.join(scriptsDir, "test_case_runner.js"),
      buildJudgePrompts: path.join(scriptsDir, "build_judge_prompts.js"),
      runJudgeEvaluations: path.join(scriptsDir, "run_judge_evaluations.js"),
      generateDashboard: path.join(scriptsDir, "generate_dashboard.js"),
    };

    log.section("LLM Evaluation Pipeline - Starting");
    log.info(`Project root: ${projectRoot}`);
    log.info(`Excel path: ${excelPath || "(default)"}`);
    log.info(`Concurrency: ${concurrency}`);
    log.info(`Error handling: fail-fast`);

    // ===== STAGE 1: Test Case Execution =====
    const testCaseArgs = [];
    if (excelPath) {
      testCaseArgs.push(excelPath);
    }
    if (concurrency > 1) {
      testCaseArgs.push("--concurrency", String(concurrency));
    }

    runStage(
      "STAGE 1: Test Case Execution",
      "node",
      [stageScripts.testCaseRunner, ...testCaseArgs],
      { cwd: projectRoot }
    );

    // Extract the run folder created by test_case_runner
    const runFolder = extractRunFolder(projectRoot);
    const runFolderPath = path.join(projectRoot, "eval", runFolder);
    log.info(`Using run folder: ${runFolder}`);

    // ===== STAGE 2: Build Judge Prompts =====
    runStage(
      "STAGE 2: Build Judge Prompts",
      "node",
      [stageScripts.buildJudgePrompts, runFolder],
      { cwd: projectRoot }
    );

    // ===== STAGE 3: Run Judge Evaluations =====
    runStage(
      "STAGE 3: Judge Evaluation",
      "node",
      [stageScripts.runJudgeEvaluations, runFolder],
      { cwd: projectRoot }
    );

    // ===== STAGE 4: Generate Dashboard =====
    runStage(
      "STAGE 4: Dashboard Generation",
      "node",
      [stageScripts.generateDashboard, runFolder],
      { cwd: projectRoot }
    );

    // ===== Summary & Output =====
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    const dashboardPath = path.join(runFolderPath, "dashboard.html");

    log.section("Pipeline Complete ✅");
    log.info(`⏱️  Total time: ${elapsedSeconds}s`);
    log.info(`📊 Dashboard: ${dashboardPath}`);
    log.info(`📁 Run folder: eval/${runFolder}/`);

    // Display folder structure
    displayFolderStructure(runFolderPath);

    // Display summary metrics
    summarizeResults(runFolderPath);

    // Open dashboard in browser
    console.log("\n🌐 Opening dashboard in browser...");
    openBrowser(`file://${dashboardPath}`);

    log.info("\n✨ All stages completed successfully!");
    process.exit(0);
  } catch (error) {
    log.error(`Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
