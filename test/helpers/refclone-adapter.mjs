// Offline named-export fixture for the real dynamic import path. No host calls.
export async function inspectReference(args) {
  return { ok: true, method: "inspectReference", args, liveState: "unknown" };
}

export async function compileAndConverge(args) {
  return { ok: false, blocked: true, method: "compileAndConverge", args, reason: "offline fixture", liveState: "unknown" };
}
