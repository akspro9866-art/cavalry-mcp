/**
 * `cavalry_doctor` — one-call environment diagnosis.
 *
 * Every other tool in this server assumes three things hold: the Stallion bridge
 * answers on its configured port, the Cavalry build behind it is awake and can
 * execute a script, and a local ffmpeg/ffprobe exists for the raster work. When a
 * run fails, those three are the first questions, and each currently costs a
 * separate probe. This module answers all three in one report with a status per
 * check and an actionable hint per failure.
 *
 * What it deliberately does *not* do:
 *  - It never creates, edits or renders a scene. The runtime probe returns scalars
 *    only, so a doctor call is safe against a scene with unsaved work.
 *  - It does not treat a mock bridge as a live one. The mock is a correct answer for
 *    CI; pretending it is Cavalry is not.
 *  - It does not raise the timeout to "make things pass". Each probe is bounded by
 *    `timeoutMs` and reports the measured latency, so a slow bridge shows up as data.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getConfig, runScriptWithExecution } from "../bridge/stallion.js";
import { defaultStatePath, ensureStateDir } from "../shared/state.js";

export type DoctorStatus = "ok" | "warn" | "fail" | "skipped";

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
  /** Measured wall clock for the probe that produced this check, when it made sense to time it. */
  ms?: number;
  hint?: string;
}

export interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  bridge: Record<string, unknown>;
  runtime: Record<string, unknown>;
  binaries: Record<string, unknown>;
  workspace: Record<string, unknown>;
  checks: DoctorCheck[];
  summary: string;
  nextSteps: string[];
}

export interface DoctorOptions {
  /** Per-probe ceiling in milliseconds (default 4000). */
  timeoutMs?: number;
  /** Run the script round trip that proves the runtime can execute (default true). */
  probeRuntime?: boolean;
  /** Cavalry version the stack was built against (default env CAVALRY_EXPECTED_VERSION or "2.8"). */
  expectedVersion?: string;
  /** Override the bridge origin for this run only (defaults to the configured STALLION_URL). */
  url?: string;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Run `bin -version` and return the first line of stdout, or an error string. */
function probeBinary(
  bin: string,
  timeoutMs: number,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, ["-version"], { windowsHide: true });
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: { ok: boolean; version?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      finish({ ok: false, error: `timed out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.stdout?.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr += String(chunk);
    });
    child.on("error", err => {
      // ENOENT is the interesting one: the binary is simply not installed.
      const code = (err as NodeJS.ErrnoException).code;
      finish({ ok: false, error: code === "ENOENT" ? `not found on PATH (${bin})` : err.message });
    });
    child.on("close", code => {
      const line = (stdout || stderr).split(/\r?\n/)[0]?.trim() ?? "";
      if (code === 0) finish({ ok: true, version: line || "ran without a version line" });
      else finish({ ok: false, error: line || `exited ${code}` });
    });
  });
}

async function httpProbe(url: string, token: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; text?: string; ms: number; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, ms: Date.now() - started };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code ??
      (err as { cause?: NodeJS.ErrnoException } | undefined)?.cause?.code;
    return {
      ok: false,
      ms: Date.now() - started,
      error: code ? String(code) : err instanceof Error ? err.name === "TimeoutError" ? "timeout" : err.message : String(err),
    };
  }
}

function firstNumberLine(text: string): string {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)[0] ?? "";
}

/** True when `actual` belongs to the same Cavalry minor the stack targets. */
export function matchesExpectedVersion(actual: string, expected: string): boolean {
  const clean = (value: string) => String(value).replace(/[^0-9.].*$/, "");
  const a = clean(actual).split(".").slice(0, 2).join(".");
  const e = clean(expected).split(".").slice(0, 2).join(".");
  return !!a && !!e && a === e;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const timeoutMs = clampInt(options.timeoutMs, 4000, 250, 60000);
  const probeRuntime = options.probeRuntime !== false;
  const expectedVersion = options.expectedVersion ?? process.env.CAVALRY_EXPECTED_VERSION ?? "2.8";
  // `url` is an internal override (tests, and a second Cavalry instance on another
  // port), deliberately not exposed as a tool argument: the operator chooses
  // STALLION_URL, and a model should not be able to redirect the probe elsewhere.
  const configured = getConfig();
  const config = options.url ? { ...configured, url: options.url.replace(/\/$/, "") } : configured;
  const checks: DoctorCheck[] = [];
  const nextSteps: string[] = [];

  // ---------------------------------------------------------------- 1. bridge
  // Two probes, run together: `/` is the cheapest reachability-and-latency signal
  // (a plain text root, present on every Stallion that has a WebServer at all), and
  // `/get` is the one that carries version and capability data. Neither alone is
  // authoritative — a bridge whose root 404s is still a working bridge — so the
  // check reports what each answered instead of treating one as a gate.
  const [root, heartbeat] = await Promise.all([
    httpProbe(`${config.url}/`, config.token, timeoutMs),
    httpProbe(`${config.url}/get`, config.token, timeoutMs),
  ]);

  let status: Record<string, unknown> = {};
  let bridgeReachable = false;
  if (heartbeat.ok && heartbeat.text) {
    try {
      const parsed = JSON.parse(heartbeat.text) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        status = parsed;
        bridgeReachable = parsed.kind === "status" || parsed.kind === "result" || parsed.type === "__stallion_result__";
      }
    } catch {
      // A legacy build answers /get with a result file body; it is still reachable.
      bridgeReachable = true;
    }
  }
  const capabilities = (status.capabilities ?? null) as Record<string, unknown> | null;
  const isMock = capabilities?.mock === true;
  /** Any HTTP answer at all means something is listening; `bridgeReachable` means it speaks the status protocol. */
  const bridgeUp = root.ok || heartbeat.ok;

  const bridgeInfo: Record<string, unknown> = {
    url: config.url,
    reachable: bridgeUp,
    statusRead: bridgeReachable,
    rootMs: root.ms,
    heartbeatMs: heartbeat.ms,
    stallion: status.stallion ?? null,
    cavalry: status.cavalry ?? null,
    scene: status.scene ?? null,
    frame: status.frame ?? null,
    capabilities,
    mock: isMock,
  };

  if (!root.ok && !heartbeat.ok) {
    checks.push({
      name: "bridge",
      status: "fail",
      detail: `No answer from ${config.url} (GET / → ${root.error ?? `HTTP ${root.status ?? "?"}`}, GET /get → ${heartbeat.error ?? `HTTP ${heartbeat.status ?? "?"}`})`,
      ms: Math.min(root.ms, heartbeat.ms),
      hint: "Start Cavalry, then run Scripts > Stallion so the bridge binds the port. CAVALRY_HOST / CAVALRY_PORT / STALLION_URL change where this looks.",
    });
    nextSteps.push("Launch Cavalry with the Stallion bridge and re-run cavalry_doctor.");
  } else if (!bridgeReachable) {
    checks.push({
      name: "bridge",
      status: "warn",
      detail: `${config.url} is listening (root ${root.status ?? "?"} in ${root.ms} ms) but /get returned no readable status (${heartbeat.error ?? `HTTP ${heartbeat.status ?? "?"}`}).`,
      ms: heartbeat.ms,
      hint: "An older Stallion build has no /get status; cavalry_run_script still works through its result file, but readback tools will not.",
    });
  } else {
    checks.push({
      name: "bridge",
      status: "ok",
      detail: `Stallion ${String(status.stallion ?? "?")} at ${config.url} — /get in ${heartbeat.ms} ms, / in ${root.ms} ms${isMock ? " (mock bridge)" : ""}`,
      ms: heartbeat.ms,
    });
  }

  // -------------------------------------------------------------- 2. runtime
  const runtimeInfo: Record<string, unknown> = { probed: probeRuntime, ready: false };
  if (!bridgeUp || !probeRuntime) {
    checks.push({
      name: "runtime",
      status: "skipped",
      detail: bridgeUp ? "Runtime probe disabled (probeRuntime:false)." : "Bridge unreachable; nothing to execute against.",
    });
  } else {
    // Scalars only. This proves api.exec runs and the seq-matched result channel
    // delivers, which is the thing every other tool silently depends on.
    const script = `
      var g = function (fn) { try { return fn(); } catch (e) { return null; } };
      return {
        version: g(function () { return api.getCavalryVersion(); }),
        comp: g(function () { return api.getActiveComp(); }),
        layers: (g(function () { return api.getCompLayers(false); }) || []).length,
        frame: g(function () { return api.getFrame(); }),
        scene: g(function () { return api.getSceneFilePath(); }),
        unsaved: g(function () { return api.sceneHasUnsavedChanges(); }),
        home: g(function () { return api.getHomeFolder(); })
      };`;
    try {
      const started = Date.now();
      const execution = await runScriptWithExecution(script, config, { helpers: false, timeoutMs, httpTimeoutMs: timeoutMs });
      const ms = Date.now() - started;
      let payload: Record<string, unknown> = {};
      if (execution.raw) {
        try {
          const envelope = JSON.parse(execution.raw) as { result?: unknown; ok?: boolean; error?: string };
          if (envelope.ok === false) throw new Error(String(envelope.error ?? "script failed"));
          if (envelope.result && typeof envelope.result === "object") payload = envelope.result as Record<string, unknown>;
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          // Unparseable channel: fall back to whatever the state file captured.
        }
      }
      const version = String(payload.version ?? status.cavalry ?? "");
      const ready = Object.keys(payload).length > 0 || !!execution.state;
      runtimeInfo.ready = ready;
      runtimeInfo.roundTripMs = ms;
      runtimeInfo.version = version || null;
      runtimeInfo.comp = payload.comp ?? null;
      runtimeInfo.layers = payload.layers ?? null;
      runtimeInfo.frame = payload.frame ?? null;
      runtimeInfo.scene = payload.scene ?? null;
      runtimeInfo.unsaved = payload.unsaved ?? null;
      runtimeInfo.cavalryHome = payload.home ?? null;
      if (!ready) {
        checks.push({
          name: "runtime",
          status: "fail",
          detail: `The bridge accepted the probe but no result came back within ${timeoutMs} ms.`,
          ms,
          hint: "Cavalry is probably busy rendering or showing a modal — the script host is single-threaded. Raise timeoutMs, or finish the blocking operation.",
        });
        nextSteps.push("Free the Cavalry UI (cancel renders, dismiss dialogs) and re-run the probe.");
      } else if (version && !matchesExpectedVersion(version, expectedVersion)) {
        checks.push({
          name: "runtime",
          status: "warn",
          detail: `Cavalry ${version} answered in ${ms} ms; this stack targets ${expectedVersion}.`,
          ms,
          hint: "Attribute paths and api surface move between minors. Run cavalry_probe_api before trusting a scene built for another version.",
        });
        nextSteps.push(`Run cavalry_probe_api to diff the live api surface against the ${expectedVersion} assumptions.`);
      } else {
        checks.push({
          name: "runtime",
          status: "ok",
          detail: `Cavalry ${version || "(version unreadable)"} executed the probe in ${ms} ms — comp ${String(payload.comp ?? "none")}, ${String(payload.layers ?? "?")} layers, frame ${String(payload.frame ?? "?")}.${isMock ? " Mock bridge: behaviour is representative, not identical." : ""}`,
          ms,
        });
      }
      if (payload.unsaved === true) {
        checks.push({ name: "unsaved-scene", status: "warn", detail: "The scene has unsaved changes; a render or crash loses them." });
      }
    } catch (err) {
      checks.push({
        name: "runtime",
        status: "fail",
        detail: `Runtime probe threw: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check that Stallion's script host is running (GET /get works but api.exec can still be wedged).",
      });
      nextSteps.push("Reload the Stallion script in Cavalry (Scripts > Stallion) and re-run.");
    }
  }

  // -------------------------------------------------------------- 3. binaries
  const ffmpegBin = process.env.FFMPEG_PATH ?? "ffmpeg";
  const ffprobeBin = process.env.FFPROBE_PATH ?? "ffprobe";
  const [ffmpeg, ffprobe] = await Promise.all([probeBinary(ffmpegBin, timeoutMs), probeBinary(ffprobeBin, timeoutMs)]);
  for (const [name, entry, bin] of [
    ["ffmpeg", ffmpeg, ffmpegBin],
    ["ffprobe", ffprobe, ffprobeBin],
  ] as const) {
    if (entry.ok) {
      checks.push({ name, status: "ok", detail: `${firstNumberLine(String(entry.version))}` });
    } else {
      checks.push({
        name,
        status: "fail",
        detail: `${bin}: ${entry.error}`,
        hint: `Sequence renders, filmstrips and beat detection need ${name}. Install it or set ${name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"}.`,
      });
      nextSteps.push(`Install ${name} (or point ${name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"} at a binary).`);
    }
  }
  const binaries: Record<string, unknown> = {
    ffmpeg: { binary: ffmpegBin, available: ffmpeg.ok, version: ffmpeg.version ?? null, error: ffmpeg.error ?? null },
    ffprobe: { binary: ffprobeBin, available: ffprobe.ok, version: ffprobe.version ?? null, error: ffprobe.error ?? null },
  };

  // ------------------------------------------------------------ 4. workspace
  const workspace: Record<string, unknown> = {};
  const statePath = config.statePath ?? defaultStatePath();
  let stateWritable = false;
  try {
    ensureStateDir(statePath);
    stateWritable = fs.existsSync(path.dirname(statePath));
  } catch {
    stateWritable = false;
  }
  workspace.statePath = statePath;
  workspace.stateWritable = stateWritable;
  workspace.resultPath = config.resultPath;
  workspace.httpTimeoutMs = config.httpTimeoutMs;
  workspace.resultTimeoutMs = config.resultTimeoutMs;
  checks.push({
    name: "workspace",
    status: stateWritable ? "ok" : "warn",
    detail: stateWritable
      ? `Telemetry state dir is writable (${String(workspace.statePath)}).`
      : `Cannot prepare the telemetry state dir at ${String(workspace.statePath)}.`,
    ...(stateWritable ? {} : { hint: "Execution telemetry will be missing; set CAVALRY_STATE_PATH to a writable location." }),
  });

  const failing = checks.filter(c => c.status === "fail");
  const warning = checks.filter(c => c.status === "warn");
  const summary = failing.length
    ? `${failing.length} blocking problem(s): ${failing.map(c => c.name).join(", ")}.`
    : warning.length
      ? `Usable, with ${warning.length} warning(s): ${warning.map(c => c.name).join(", ")}.`
      : `All checks passed${isMock ? " against the mock bridge" : ""}.`;

  if (!nextSteps.length && warning.length) {
    nextSteps.push("Address the warnings above only if a run depends on the feature they describe.");
  }

  return {
    ok: failing.length === 0,
    generatedAt: new Date().toISOString(),
    bridge: bridgeInfo,
    runtime: runtimeInfo,
    binaries,
    workspace,
    checks,
    summary,
    nextSteps,
  };
}

/** Compact human-readable rendering, used by the tool and by tests. */
export function formatDoctorReport(report: DoctorReport): string {
  const marks: Record<DoctorStatus, string> = { ok: "PASS", warn: "WARN", fail: "FAIL", skipped: "SKIP" };
  const lines = [
    `cavalry_doctor — ${report.ok ? "ready" : "not ready"} (${report.summary})`,
    ...report.checks.map(check => {
      const timing = typeof check.ms === "number" ? ` [${check.ms} ms]` : "";
      return `${marks[check.status].padEnd(4)} ${check.name.padEnd(14)} ${check.detail}${timing}${check.hint ? `\n       → ${check.hint}` : ""}`;
    }),
  ];
  if (report.nextSteps.length) lines.push(`Next: ${report.nextSteps.join(" ")}`);
  return lines.join("\n");
}
