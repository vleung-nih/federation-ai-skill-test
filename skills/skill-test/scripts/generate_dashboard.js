const path = require("node:path");
const { existsSync, readFileSync, writeFileSync, readdirSync, statSync } = require("node:fs");

function resolveRunFolder(runFolderArg) {
  if (!runFolderArg) {
    throw new Error("Missing run folder argument. Example: node generate_dashboard.js 20260617-223400");
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "eval", runFolderArg),
    path.resolve(cwd, runFolderArg),
  ];

  if (path.isAbsolute(runFolderArg)) {
    candidates.unshift(runFolderArg);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(`Run folder not found: ${runFolderArg}`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getLastTwoNonEmptyLines(filePath) {
  const lines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.slice(-2);
}

function extractAgentTextFromLastTwoLines(outputJsonlPath) {
  const lines = getLastTwoNonEmptyLines(outputJsonlPath);
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (
      parsed &&
      parsed.type === "item.completed" &&
      parsed.item &&
      parsed.item.type === "agent_message" &&
      typeof parsed.item.text === "string"
    ) {
      return parsed.item.text;
    }
  }

  throw new Error(`Cannot find agent_message in last two non-empty lines: ${outputJsonlPath}`);
}

function extractTokenUsage(outputJsonlPath) {
  const lines = readFileSync(outputJsonlPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let usage = null;
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed && parsed.type === "turn.completed" && parsed.usage && typeof parsed.usage === "object") {
      usage = parsed.usage;
    }
  }

  return usage;
}

function normalizeExpectedOutput(meta) {
  if (typeof meta.expectedOutput === "string") {
    return meta.expectedOutput;
  }
  if (typeof meta.expected_output === "string") {
    return meta.expected_output;
  }
  return "";
}

function listCaseFolders(runFolderPath) {
  return readdirSync(runFolderPath)
    .map((name) => path.join(runFolderPath, name))
    .filter((fullPath) => statSync(fullPath).isDirectory());
}

function toNumberOrNull(value) {
  return typeof value === "number" ? value : null;
}

function loadCase(caseFolderPath) {
  const caseName = path.basename(caseFolderPath);
  const outputJsonlPath = path.join(caseFolderPath, "output.jsonl");
  const metaPath = path.join(caseFolderPath, "meta.json");
  const evaluationPath = path.join(caseFolderPath, "evaluation.json");

  if (!existsSync(outputJsonlPath)) {
    throw new Error(`Missing output.jsonl in ${caseFolderPath}`);
  }
  if (!existsSync(metaPath)) {
    throw new Error(`Missing meta.json in ${caseFolderPath}`);
  }

  const meta = readJson(metaPath);
  const expectedResult = normalizeExpectedOutput(meta);
  const llmGeneratedResult = extractAgentTextFromLastTwoLines(outputJsonlPath);
  const tokenUsage = extractTokenUsage(outputJsonlPath);

  let evaluation = null;
  if (existsSync(evaluationPath)) {
    evaluation = readJson(evaluationPath);
  }

  return {
    caseName,
    prompt: typeof meta.prompt === "string" ? meta.prompt : "",
    expectedResult,
    llmGeneratedResult,
    tokenUsage: tokenUsage || null,
    overallPass: evaluation ? Boolean(evaluation.overall_pass) : null,
    semanticMatchScore: evaluation ? toNumberOrNull(evaluation.semantic_match_score) : null,
    completenessScore: evaluation ? toNumberOrNull(evaluation.completeness_score) : null,
    correctnessScore: evaluation ? toNumberOrNull(evaluation.correctness_score) : null,
    comparisonSummary: evaluation && typeof evaluation.comparison_summary === "string" ? evaluation.comparison_summary : "",
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHtml(runFolderName, cases) {
  const dataJson = JSON.stringify(cases);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Test Case Dashboard - ${escapeHtml(runFolderName)}</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #122033;
      --muted: #5b6c82;
      --line: #d9e2ef;
      --ok: #0f8a5f;
      --bad: #c03a2b;
      --chip: #eef3fb;
      --accent: #1d6fd7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: radial-gradient(circle at 15% 20%, #e5eefc 0%, #f6f8fb 55%), linear-gradient(180deg, #f7f9fd 0%, #eef3fb 100%);
      color: var(--text);
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    .wrap {
      max-width: 1320px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 25px rgba(16, 42, 74, 0.08);
      overflow: hidden;
    }
    .head {
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, #fdfefe 0%, #f2f7ff 100%);
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 0.2px;
    }
    .sub {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
      align-items: center;
      background: #fbfdff;
    }
    select, button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      border-radius: 8px;
      height: 34px;
      padding: 0 10px;
      font-size: 13px;
      cursor: pointer;
    }
    button.primary {
      border-color: #c8d8f6;
      background: #e8f0ff;
      color: #0b4ea1;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: #f7faff;
      color: #2d4666;
      user-select: none;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    th.sortable { cursor: pointer; }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .pill.pass { background: #d6f5e8; color: var(--ok); }
    .pill.fail { background: #fde0dc; color: var(--bad); }
    .pill.na { background: var(--chip); color: var(--muted); }
    .prompt {
      max-width: 560px;
      line-height: 1.4;
    }
    .details-cell {
      background: #fdfefe;
      padding: 0;
    }
    .details {
      display: none;
      padding: 14px;
      border-top: 1px dashed #ccd9ec;
      background: linear-gradient(180deg, #fcfdff 0%, #f8fbff 100%);
    }
    .details.show { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(280px, 1fr));
      gap: 10px;
    }
    .box {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
      min-height: 120px;
    }
    .box h4 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #31527c;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .pre {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.35;
      font-size: 12px;
      color: #203650;
    }
    .scoreline {
      margin: 4px 0;
      font-size: 13px;
      color: #1d3557;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .prompt { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1 class="title">Test Case Execution Dashboard</h1>
      <div class="sub">Run Folder: ${escapeHtml(runFolderName)}</div>
    </div>
    <div class="controls">
      <label for="sortBy">Sort by</label>
      <select id="sortBy">
        <option value="caseName">Test Case Name</option>
        <option value="overallPass">Overall Pass</option>
        <option value="semanticMatchScore">Semantic Match Score</option>
        <option value="completenessScore">Completeness Score</option>
        <option value="correctnessScore">Correctness Score</option>
      </select>
      <select id="sortOrder">
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
      <button id="applySort" class="primary">Apply Sort</button>
      <button id="expandAll">Show All Details</button>
      <button id="collapseAll">Hide All Details</button>
    </div>
    <table>
      <thead>
        <tr>
          <th class="sortable" data-field="caseName">Test Case Name</th>
          <th class="sortable" data-field="prompt">Prompt</th>
          <th class="sortable" data-field="overallPass">Overall Pass</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <script>
    const testCases = ${dataJson};

    function displayPass(value) {
      if (value === true) return '<span class="pill pass">PASS</span>';
      if (value === false) return '<span class="pill fail">FAIL</span>';
      return '<span class="pill na">N/A</span>';
    }

    function safe(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function usageBlock(usage) {
      if (!usage) {
        return '<div class="muted">No usage data found in output.jsonl</div>';
      }
      const total =
        (Number(usage.input_tokens) || 0) +
        (Number(usage.output_tokens) || 0) +
        (Number(usage.cached_input_tokens) || 0) +
        (Number(usage.reasoning_output_tokens) || 0);
      return [
        '<div class="scoreline">input_tokens: ' + (usage.input_tokens ?? 'N/A') + '</div>',
        '<div class="scoreline">output_tokens: ' + (usage.output_tokens ?? 'N/A') + '</div>',
        '<div class="scoreline">cached_input_tokens: ' + (usage.cached_input_tokens ?? 'N/A') + '</div>',
        '<div class="scoreline">reasoning_output_tokens: ' + (usage.reasoning_output_tokens ?? 'N/A') + '</div>',
        '<div class="scoreline"><strong>estimated_total_tokens: ' + total + '</strong></div>'
      ].join('');
    }

    function toSortValue(item, field) {
      const value = item[field];
      if (value === null || value === undefined) return field === 'overallPass' ? -1 : '';
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    }

    function sortCases(field, order) {
      testCases.sort((a, b) => {
        const av = toSortValue(a, field);
        const bv = toSortValue(b, field);
        if (typeof av === 'number' && typeof bv === 'number') {
          return order === 'asc' ? av - bv : bv - av;
        }
        const cmp = String(av).localeCompare(String(bv));
        return order === 'asc' ? cmp : -cmp;
      });
    }

    function renderRows() {
      const tbody = document.getElementById('rows');
      tbody.innerHTML = '';

      testCases.forEach((t, idx) => {
        const row = document.createElement('tr');
        row.innerHTML =
          '<td>' + safe(t.caseName) + '</td>' +
          '<td class="prompt">' + safe(t.prompt) + '</td>' +
          '<td>' + displayPass(t.overallPass) + '</td>' +
          '<td><button type="button" data-target="d-' + idx + '" class="toggle">Show</button></td>';
        tbody.appendChild(row);

        const detailsRow = document.createElement('tr');
        detailsRow.innerHTML =
          '<td colspan="4" class="details-cell">' +
            '<div id="d-' + idx + '" class="details">' +
              '<div class="grid">' +
                '<div class="box">' +
                  '<h4>Expected Result</h4>' +
                  '<div class="pre">' + safe(t.expectedResult) + '</div>' +
                '</div>' +
                '<div class="box">' +
                  '<h4>LLM Generated Result</h4>' +
                  '<div class="pre">' + safe(t.llmGeneratedResult) + '</div>' +
                '</div>' +
                '<div class="box">' +
                  '<h4>Token Usage</h4>' +
                  usageBlock(t.tokenUsage) +
                '</div>' +
                '<div class="box">' +
                  '<h4>Evaluation</h4>' +
                  '<div class="scoreline">overall_pass: ' + (t.overallPass === null ? 'N/A' : t.overallPass) + '</div>' +
                  '<div class="scoreline">semantic_match_score: ' + (t.semanticMatchScore ?? 'N/A') + '</div>' +
                  '<div class="scoreline">completeness_score: ' + (t.completenessScore ?? 'N/A') + '</div>' +
                  '<div class="scoreline">correctness_score: ' + (t.correctnessScore ?? 'N/A') + '</div>' +
                  '<div class="scoreline"><strong>comparison_summary:</strong></div>' +
                  '<div class="pre">' + safe(t.comparisonSummary || 'N/A') + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</td>';
        tbody.appendChild(detailsRow);
      });

      document.querySelectorAll('button.toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.target);
          if (!target) return;
          const show = !target.classList.contains('show');
          target.classList.toggle('show', show);
          btn.textContent = show ? 'Hide' : 'Show';
        });
      });
    }

    document.getElementById('applySort').addEventListener('click', () => {
      const field = document.getElementById('sortBy').value;
      const order = document.getElementById('sortOrder').value;
      sortCases(field, order);
      renderRows();
    });

    document.getElementById('expandAll').addEventListener('click', () => {
      document.querySelectorAll('.details').forEach((el) => el.classList.add('show'));
      document.querySelectorAll('button.toggle').forEach((btn) => (btn.textContent = 'Hide'));
    });

    document.getElementById('collapseAll').addEventListener('click', () => {
      document.querySelectorAll('.details').forEach((el) => el.classList.remove('show'));
      document.querySelectorAll('button.toggle').forEach((btn) => (btn.textContent = 'Show'));
    });

    document.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        document.getElementById('sortBy').value = th.dataset.field;
        document.getElementById('applySort').click();
      });
    });

    renderRows();
  </script>
</body>
</html>`;
}

function main() {
  const runFolderArg = process.argv[2];
  const runFolderPath = resolveRunFolder(runFolderArg);
  const runFolderName = path.basename(runFolderPath);
  const outPathArg = process.argv[3];
  const outPath = outPathArg
    ? path.resolve(process.cwd(), outPathArg)
    : path.join(runFolderPath, "dashboard.html");

  const cases = listCaseFolders(runFolderPath)
    .map((folder) => loadCase(folder))
    .sort((a, b) => a.caseName.localeCompare(b.caseName));

  const html = renderHtml(runFolderName, cases);
  writeFileSync(outPath, html, "utf8");

  console.log(`[INFO] Dashboard created: ${outPath}`);
  console.log(`[INFO] Cases included: ${cases.length}`);
}

try {
  main();
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}
