import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  runAutonomousPlan,
  readAutonomousStatus,
  controlAutonomousInvestigation,
} from "./autonomy.js";
import {
  autonomousPlanSchema,
  type AutonomousPlan,
} from "../application/autonomy/AutonomousPlan.js";
import { discoverTools } from "../application/autonomy/ToolDiscovery.js";
import { generateNumericExperiments } from "../domain/autonomyExperiments.js";
import { resolveAutonomyEnvironment } from "./autonomyEnvironment.js";

interface DashboardRuntime {
  readonly plan: AutonomousPlan;
  readonly checkpoint: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  operation: Promise<unknown> | undefined;
  failure: string | undefined;
}

const dashboardState = async (runtime: DashboardRuntime) => {
  let state: unknown;
  try {
    state = await readAutonomousStatus(runtime.checkpoint);
  } catch (cause: unknown) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT"))
      throw cause;
    const generated =
      runtime.plan.experiments === undefined
        ? []
        : generateNumericExperiments(runtime.plan.experiments);
    state = {
      status: "ready",
      iteration: 0,
      config: {
        ...runtime.plan.investigation,
        cases: [...runtime.plan.investigation.cases, ...generated],
      },
      functions: [],
      results: [],
      evidence: [],
      history: [],
      limitations: [],
    };
  }
  return {
    state,
    active: runtime.operation !== undefined,
    failure: runtime.failure,
    model:
      runtime.plan.model?.provider ??
      runtime.plan.reconstruction?.policy ??
      "Comparison only",
  };
};

const dashboardAction = async (
  action: "start" | "resume" | "pause" | "stop",
  runtime: DashboardRuntime,
): Promise<number> => {
  if (action === "pause" || action === "stop") {
    await controlAutonomousInvestigation(runtime.checkpoint, action);
    return 202;
  }
  if (runtime.operation !== undefined) return 409;
  runtime.failure = undefined;
  runtime.operation = runAutonomousPlan(runtime.plan, runtime.checkpoint, {
    resume: action === "resume",
    environment: runtime.environment,
  })
    .catch((cause: unknown) => {
      runtime.failure =
        cause instanceof Error ? cause.message : "Investigation failed";
    })
    .finally(() => {
      runtime.operation = undefined;
    });
  return 202;
};

/** Loopback-only REA control surface. No arbitrary paths or commands come from HTTP. */
export const startAutonomyDashboard = async (
  planPath: string,
  checkpoint: string,
  port = 0,
  selectedEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
) => {
  const plan = autonomousPlanSchema.parse(
    JSON.parse(await readFile(planPath, "utf8")),
  );
  const environment = await resolveAutonomyEnvironment(selectedEnvironment);
  const runtime: DashboardRuntime = {
    plan,
    checkpoint,
    environment,
    operation: undefined,
    failure: undefined,
  };
  const token = randomBytes(24).toString("hex"),
    base = `/session/${token}`;
  const server = createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader(
      "content-security-policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    const address = server.address();
    if (address === null || typeof address === "string") {
      send(503, { error: "Dashboard unavailable" });
      return;
    }
    const origin = `http://127.0.0.1:${address.port}`;
    if (
      request.headers.host !== `127.0.0.1:${address.port}` ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== origin)
    ) {
      send(403, { error: "Invalid dashboard origin" });
      return;
    }
    const path = request.url ?? "";
    if (request.method === "GET" && path === base) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(dashboardHtml(base, token));
      return;
    }
    if (request.headers["x-rea-token"] !== token) {
      send(403, { error: "Dashboard authorization required" });
      return;
    }
    try {
      if (request.method === "GET" && path === `${base}/state`) {
        send(200, await dashboardState(runtime));
        return;
      }
      if (request.method === "GET" && path === `${base}/tools`) {
        send(200, await discoverTools({ environment }));
        return;
      }
      const action = path.startsWith(`${base}/`)
        ? path.slice(base.length + 1)
        : undefined;
      if (
        request.method === "POST" &&
        (action === "start" ||
          action === "resume" ||
          action === "pause" ||
          action === "stop")
      ) {
        const status = await dashboardAction(action, runtime);
        send(
          status,
          status === 409
            ? { error: "Investigation already active" }
            : { requested: action },
        );
        return;
      }
      send(404, { error: "Unknown dashboard operation" });
    } catch (cause: unknown) {
      send(400, {
        error:
          cause instanceof Error ? cause.message : "Dashboard request failed",
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Dashboard has no TCP address");
  const close = async () => {
    if (runtime.operation !== undefined) {
      await controlAutonomousInvestigation(checkpoint, "pause");
      await runtime.operation;
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  };
  return { url: `http://127.0.0.1:${address.port}${base}`, close };
};

// Colors and typography match website/public/assets/styles.css; all target data uses textContent.
const dashboardHtml = (base: string, token: string): string => `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REA · Autonomous investigation</title>
<style>
:root{--ink:#20252b;--muted:#5b6570;--line:#e0e5e9;--soft:#f4f6f8;--accent:#294f82;--page:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);background:var(--page)}
*{box-sizing:border-box}body{margin:0;line-height:1.6;overflow-wrap:anywhere}header{padding:24px 5vw;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:16px}h1{font-size:24px;letter-spacing:-.035em;margin:0}h2{font-size:18px;margin:0 0 12px}main{max-width:1440px;margin:auto;padding:28px 5vw}button{font:inherit;background:white;color:var(--accent);border:1px solid var(--line);border-radius:4px;padding:7px 16px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:first-child{background:var(--accent);color:#fff}button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.controls{display:flex;flex-wrap:wrap;gap:8px}.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0}.metric{border-bottom:3px solid var(--accent);padding:12px 0;min-width:0}.metric strong{display:block;font-size:26px}.label,.muted{color:var(--muted);font-size:13px}.layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:28px}.panel{min-width:0;border:1px solid var(--line);padding:20px;margin-bottom:20px;border-radius:4px}code,pre{font-family:"SFMono-Regular",Consolas,monospace;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--soft);padding:12px;max-height:400px;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;table-layout:fixed}th,td{padding:8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}th{color:var(--muted)}.pass{color:#226440}.fail{color:#a33127}.unknown{color:#805d1b}details{margin:8px 0}summary{cursor:pointer}#error{color:#a33127;white-space:pre-wrap}.limit{background:var(--soft);padding:14px;margin-top:16px;font-size:13px}.scroll{max-height:420px;overflow:auto}#target{font-family:monospace;font-size:12px;max-width:100%}@media(max-width:800px){header{display:block}.controls{margin-top:16px}.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:minmax(0,1fr)}}
</style><header><div><div class="label">REA / Reconstruction workspace</div><h1>Autonomous investigation</h1></div><div class="controls"><button data-action="start">Start</button><button data-action="pause">Pause</button><button data-action="resume">Resume</button><button data-action="stop">Stop</button></div></header>
<main><div id="target"></div><p id="error" role="alert"></p><div class="overview"><div class="metric"><span class="label">Investigation</span><strong id="status">Loading</strong></div><div class="metric"><span class="label">Iterations</span><strong id="iterations">0</strong></div><div class="metric"><span class="label">Declared cases passing</span><strong id="coverage">0 / 0</strong></div><div class="metric"><span class="label">Evidence records</span><strong id="evidence-count">0</strong></div></div>
<div class="layout"><div><section class="panel"><h2>Differential results</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Observed status</th><th>Comparison evidence</th></tr></thead><tbody id="results"></tbody></table></div><div class="limit">Suite success establishes equality for declared observations. Universal equivalence and unobserved behavior remain unproven.</div></section><section class="panel"><h2>Function inventory</h2><div class="scroll"><table><thead><tr><th>Function</th><th>Address</th><th>Evidence lifecycle</th></tr></thead><tbody id="functions"></tbody></table></div></section><section class="panel"><h2>Evidence explorer</h2><div id="evidence" class="scroll"></div></section></div>
<aside><section class="panel"><h2>Agents and build activity</h2><p class="muted" id="model"></p><div id="history" class="scroll"></div></section><section class="panel"><h2>Tool management</h2><button id="tools-button">Discover installed tools</button><div id="tools"></div></section><section class="panel"><h2>Remaining uncertainty</h2><div id="limits"></div></section></aside></div></main>
<script>
const base=${JSON.stringify(base)},token=${JSON.stringify(token)};
const byId=id=>document.getElementById(id),text=(id,value)=>byId(id).textContent=String(value);
async function api(path,method='GET'){const response=await fetch(base+'/'+path,{method,headers:{'x-rea-token':token}});const value=await response.json();if(!response.ok)throw new Error(value.error);return value}
function row(values){const tr=document.createElement('tr');values.forEach(value=>{const td=document.createElement('td');td.textContent=String(value);tr.append(td)});return tr}
function details(title,value){const node=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=title;pre.textContent=JSON.stringify(value,null,2);node.append(summary,pre);return node}
async function update(){try{const value=await api('state'),s=value.state;text('status',s.status);text('iterations',s.iteration);text('target',s.config.binaryPath);text('coverage',(s.results.filter(r=>r.status==='pass').length)+' / '+s.config.cases.length);text('evidence-count',s.evidence.length);text('model','Model: '+value.model);text('error',value.failure||'');byId('results').replaceChildren(...s.results.map(r=>{const tr=row([r.caseId,r.status,r.comparisonEvidenceId]);tr.className=r.status;return tr}));byId('functions').replaceChildren(...s.functions.map(f=>row([f.name,f.address,f.lifecycle])));byId('evidence').replaceChildren(...s.evidence.map(e=>details(e.operation+' · '+e.evidence_id,e)));byId('history').replaceChildren(...s.history.slice(-30).reverse().map(h=>details(h.event+' · '+h.at,h.detail)));byId('limits').replaceChildren(...s.limitations.map(l=>{const p=document.createElement('p');p.className='muted';p.textContent=l;return p}));document.querySelector('[data-action=start]').disabled=value.active||s.status!=='ready';document.querySelector('[data-action=resume]').disabled=value.active||!['paused','failed','budget-exhausted'].includes(s.status);document.querySelector('[data-action=pause]').disabled=!value.active;document.querySelector('[data-action=stop]').disabled=['stopped','suite-passed'].includes(s.status)}catch(e){text('error',e.message)}}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',async()=>{try{await api(b.dataset.action,'POST');await update()}catch(e){text('error',e.message)}}));
byId('tools-button').addEventListener('click',async()=>{try{const t=await api('tools');byId('tools').replaceChildren(...t.tools.map(v=>details(v.id+' · '+v.state,v)))}catch(e){text('error',e.message)}});
update();setInterval(update,1500);
</script></html>`;
