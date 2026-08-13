/** Runs the browser suites against a production build.
 *
 *  Each suite drives a real page and asserts by printing PASS/FAIL lines, so
 *  this starts one preview server, runs them in turn, and fails the run if any
 *  line says FAIL or a suite exits badly.
 *
 *  The API routes aren't served by `vite preview` — they're Vercel functions —
 *  so the suites intercept /api/* and serve fixtures. That's deliberate: these
 *  cover the app's behaviour, and the functions are exercised on a deployment.
 */

import { spawn } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PORT = 4183;
const BASE = `http://localhost:${PORT}`;

mkdirSync(new URL("./screenshots", import.meta.url), { recursive: true });

const suites = readdirSync(HERE)
  .filter((name) => name.endsWith(".mjs") && !name.startsWith("_") && name !== "run.mjs")
  .sort();

const server = spawn(
  "npx",
  ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { stdio: "ignore" },
);

const stop = () => server.kill();
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The preview server never came up on ${BASE}. Run npm run build first.`);
}

const run = (suite) =>
  new Promise((resolve) => {
    const child = spawn("node", [`${HERE}${suite}`], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ output, code }));
  });

await waitForServer();

let failed = 0;
let passed = 0;

for (const suite of suites) {
  const { output, code } = await run(suite);
  const passes = (output.match(/^PASS/gm) ?? []).length;
  const failures = output.split("\n").filter((line) => line.startsWith("FAIL"));
  passed += passes;
  failed += failures.length;

  const bad = failures.length > 0 || code !== 0;
  console.log(`${bad ? "✗" : "✓"} ${suite.padEnd(20)} ${passes} passed`);
  if (bad) {
    failed += code !== 0 && failures.length === 0 ? 1 : 0;
    console.log(output.replace(/^/gm, "    "));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
stop();
process.exit(failed > 0 ? 1 : 0);
