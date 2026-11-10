/**
 * 100-Point `_mg` Purity Rubric & Pre-Flight Gate (`validate-mg-purity.ts`).
 *
 * Shared between `cavalry-mcp`, `refclone` Stage 3 (`mg-compiler`), and
 * `stallion` (`localhost:8080`).
 */

export type PurityGrade = "A" | "B" | "C" | "D" | "F";

export interface PurityViolation {
  rule:
    | "atomic_undo_safety"
    | "mg_primitive_purity"
    | "tokenized_styling"
    | "procedural_motion_purity";
  line: number;
  pointsDeducted: number;
  snippet: string;
  message: string;
}

export interface PurityBreakdown {
  atomicUndoSafety: number;
  mgPrimitivePurity: number;
  tokenizedStyling: number;
  proceduralMotionPurity: number;
}

export interface PurityValidationResult {
  score: number;
  grade: PurityGrade;
  passed: boolean;
  breakdown: PurityBreakdown;
  violations: PurityViolation[];
  autoFixPrompt: string;
}

export interface SelfCorrectPurityOptions {
  theme?: string;
  useMgUndoGroup?: boolean;
  appendAutoFixComment?: boolean;
}

export interface SelfCorrectPurityResult {
  correctedScript: string;
  initialValidation: PurityValidationResult;
  finalValidation: PurityValidationResult;
  selfCorrected: boolean;
}

function blankRangePreservingNewlines(source: string, start: number, end: number): string {
  const prefix = source.slice(0, start);
  const middle = source.slice(start, end).replace(/[^\n\r]/g, " ");
  const suffix = source.slice(end);
  return prefix + middle + suffix;
}

function maskHelperDefsAndComments(scriptString: string): string {
  let masked = String(scriptString ?? "");

  const rbStart = masked.indexOf("const _rb = (function ()");
  const mgEndMarker = "Object.assign(_mg.theme, _mg.ASTRYX_THEMES.neutral";
  const mgLegacyEndRegex = /\bsel\(\)\s*\{\s*return\s+api\.getSelection\(\)\[0\];\s*\}\s*\};/;

  if (rbStart >= 0) {
    let endIdx = -1;
    const markerIdx = masked.indexOf(mgEndMarker, rbStart);
    if (markerIdx >= 0) {
      const closeIdx = masked.indexOf("} catch (e) {}", markerIdx);
      if (closeIdx >= 0) {
        endIdx = closeIdx + "} catch (e) {}".length;
      }
    }
    if (endIdx < 0) {
      const legacyMatch = mgLegacyEndRegex.exec(masked.slice(rbStart));
      if (legacyMatch) {
        endIdx = rbStart + legacyMatch.index + legacyMatch[0].length;
      }
    }
    if (endIdx > rbStart) {
      masked = blankRangePreservingNewlines(masked, rbStart, endIdx);
    }
  }

  const standaloneMgMatch = /(?:const|let|var)\s+_mg\s*=\s*\{[\s\S]*?\n\};/.exec(masked);
  if (standaloneMgMatch) {
    masked = blankRangePreservingNewlines(
      masked,
      standaloneMgMatch.index,
      standaloneMgMatch.index + standaloneMgMatch[0].length,
    );
  }

  const manifestRuntimeMatch = /var\s+__mgApplyManifest\s*=\s*function\s*\(manifest\)\s*\{[\s\S]*?\n\};/.exec(masked);
  if (manifestRuntimeMatch) {
    masked = blankRangePreservingNewlines(
      masked,
      manifestRuntimeMatch.index,
      manifestRuntimeMatch.index + manifestRuntimeMatch[0].length,
    );
  }

  masked = masked.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, (comment) =>
    comment.replace(/[^\n\r]/g, " "),
  );

  return masked;
}

export function gradeFromScore(score: number): PurityGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function validateMgPurity(scriptString: string): PurityValidationResult {
  const raw = String(scriptString ?? "");
  const rawLines = raw.split(/\r?\n/);
  const masked = maskHelperDefsAndComments(raw);
  const maskedLines = masked.split(/\r?\n/);

  const violations: PurityViolation[] = [];

  const hasStartUndo = /\bapi\.startUndo(?:Group)?\s*\(/.test(masked);
  const hasTry = /\btry\s*\{/.test(masked);
  const hasFinally = /\bfinally\s*\{/.test(masked);
  const hasEndUndo = /\bapi\.endUndo(?:Group)?\s*\(/.test(masked);
  const hasExplicitUndoTryFinally = hasStartUndo && hasTry && hasFinally && hasEndUndo;
  const hasMgUndoGroup = /\b_mg\.undoGroup\s*\(/.test(masked);

  let undoDeduction = 0;
  if (!hasExplicitUndoTryFinally && !hasMgUndoGroup) {
    undoDeduction = 25;
    violations.push({
      rule: "atomic_undo_safety",
      line: 1,
      pointsDeducted: 25,
      snippet: (rawLines[0] ?? "").trim().slice(0, 120),
      message:
        'Line 1: Missing atomic undo safety wrapper; wrap scene operations in `api.startUndo("..."); try { ... } finally { api.endUndo(); }`.',
    });
  }

  let primitiveDeduction = 0;
  const rawApiCallRegex = /\bapi\.(create|set)\s*\(/g;
  for (let i = 0; i < maskedLines.length; i++) {
    const lineText = maskedLines[i];
    let match: RegExpExecArray | null;
    rawApiCallRegex.lastIndex = 0;
    while ((match = rawApiCallRegex.exec(lineText)) !== null) {
      const deducted = primitiveDeduction < 30 ? Math.min(5, 30 - primitiveDeduction) : 0;
      primitiveDeduction = Math.min(30, primitiveDeduction + 5);
      const lineNum = i + 1;
      const method = match[1];
      const replacementHint =
        method === "create"
          ? "_mg.shape(), _mg.text(), or _mg.layer()"
          : "_mg.set(layerId, attrs)";
      violations.push({
        rule: "mg_primitive_purity",
        line: lineNum,
        pointsDeducted: deducted,
        snippet: (rawLines[i] ?? "").trim(),
        message: `Line ${lineNum}: Replace raw \`api.${method}(\` with \`${replacementHint}\`.`,
      });
    }
  }

  let stylingDeduction = 0;
  const hexLiteralRegex = /(?<![A-Za-z0-9_])#[0-9A-Fa-f]{6}\b/g;
  for (let i = 0; i < maskedLines.length; i++) {
    const lineText = maskedLines[i];
    if (/\b_mg\.applySceneTheme\s*\(/.test(lineText)) {
      continue;
    }
    let match: RegExpExecArray | null;
    hexLiteralRegex.lastIndex = 0;
    while ((match = hexLiteralRegex.exec(lineText)) !== null) {
      const hexLiteral = match[0];
      const deducted = stylingDeduction < 25 ? Math.min(5, 25 - stylingDeduction) : 0;
      stylingDeduction = Math.min(25, stylingDeduction + 5);
      const lineNum = i + 1;
      violations.push({
        rule: "tokenized_styling",
        line: lineNum,
        pointsDeducted: deducted,
        snippet: (rawLines[i] ?? "").trim(),
        message: `Line ${lineNum}: Replace hardcoded hex literal \`${hexLiteral}\` with an \`_mg.theme.*\` token (e.g. \`_mg.theme.cardFill\`, \`_mg.theme.textPrimary\`, \`_mg.theme.accentPrimary\`).`,
      });
    }
  }

  let motionDeduction = 0;
  const keyframeLoopRegex =
    /\b(?:for|while)\s*\([^)]*\)\s*\{[\s\S]*?\b(?:api\.keyframe|_mg\.keyframe)\s*\([\s\S]*?\}/g;
  let loopMatch: RegExpExecArray | null;
  while ((loopMatch = keyframeLoopRegex.exec(masked)) !== null) {
    const prefix = masked.slice(0, loopMatch.index);
    const lineNum = prefix.split(/\r?\n/).length;
    const deducted = motionDeduction < 20 ? Math.min(10, 20 - motionDeduction) : 0;
    motionDeduction = Math.min(20, motionDeduction + 10);
    violations.push({
      rule: "procedural_motion_purity",
      line: lineNum,
      pointsDeducted: deducted,
      snippet: (rawLines[lineNum - 1] ?? "").trim(),
      message: `Line ${lineNum}: Replace frame-by-frame keyframe loop with procedural \`_mg.spring()\`, \`_mg.modulate()\`, or \`_mg.stagger()\`.`,
    });
  }

  const totalDeduction = undoDeduction + primitiveDeduction + stylingDeduction + motionDeduction;
  const score = Math.max(0, 100 - totalDeduction);
  const grade = gradeFromScore(score);
  const passed = score >= 75;

  let autoFixPrompt = "";
  if (!passed || violations.length > 0) {
    const instructions = violations.map((v) => v.message).join(" ");
    autoFixPrompt = `Refactor this Cavalry script to achieve Grade A _mg purity (current score: ${score}/100, grade: ${grade}): call _mg.applySceneTheme("neutral") inside an atomic api.startUndo(...) / try { ... } finally { api.endUndo(); } block and apply these exact line fixes: ${instructions}`;
  }

  return {
    score,
    grade,
    passed,
    breakdown: {
      atomicUndoSafety: 25 - undoDeduction,
      mgPrimitivePurity: 30 - primitiveDeduction,
      tokenizedStyling: 25 - stylingDeduction,
      proceduralMotionPurity: 20 - motionDeduction,
    },
    violations,
    autoFixPrompt,
  };
}

export function selfCorrectMgPurity(
  scriptString: string,
  options: SelfCorrectPurityOptions = {},
): SelfCorrectPurityResult {
  const initial = validateMgPurity(scriptString);
  if (initial.passed && initial.score >= 90) {
    return {
      correctedScript: scriptString,
      initialValidation: initial,
      finalValidation: initial,
      selfCorrected: false,
    };
  }

  const theme =
    typeof options.theme === "string" && options.theme.trim() ? options.theme.trim() : "neutral";
  let corrected = String(scriptString ?? "");

  corrected = corrected.replace(
    /\b(?:for|while)\s*\([^)]*\)\s*\{[\s\S]*?\b(?:api\.keyframe|_mg\.keyframe)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,[\s\S]*?\}/g,
    (_match, targetExpr: string, attrExpr: string) =>
      `_mg.modulate(${targetExpr.trim()}, ${attrExpr.trim()}, { type: "spring", amplitude: 1, duration: 30 });`,
  );

  corrected = corrected.replace(/\bapi\.create\s*\(/g, "_mg.layer(");
  corrected = corrected.replace(/\bapi\.set\s*\(/g, "_mg.set(");

  corrected = corrected
    .split(/\r?\n/)
    .map((line) => {
      if (/\b_mg\.applySceneTheme\s*\(/.test(line) || /^\s*\/\//.test(line)) {
        return line;
      }
      return line.replace(/(["'])(#[0-9A-Fa-f]{6})\1/g, (_m, _quote: string, hex: string) => {
        const upper = hex.toUpperCase();
        if (
          upper === "#0F1115" ||
          upper === "#0D1512" ||
          upper === "#09090B" ||
          upper === "#0B0C10"
        ) {
          return "_mg.theme.bgSurface";
        }
        if (
          upper === "#181B20" ||
          upper === "#14221C" ||
          upper === "#121216" ||
          upper === "#1F2937"
        ) {
          return "_mg.theme.cardFill";
        }
        if (
          upper === "#F3F4F6" ||
          upper === "#ECFDF5" ||
          upper === "#FAFAFA" ||
          upper === "#FFFFFF"
        ) {
          return "_mg.theme.textPrimary";
        }
        if (upper === "#9CA3AF" || upper === "#86EFAC" || upper === "#A1A1AA") {
          return "_mg.theme.textMuted";
        }
        if (upper === "#262A32" || upper === "#1F352B" || upper === "#27272A") {
          return "_mg.theme.strokeColor";
        }
        return "_mg.theme.accentPrimary";
      });
    })
    .join("\n");

  if (!/\b_mg\.applySceneTheme\s*\(/.test(corrected)) {
    corrected = `_mg.applySceneTheme(${JSON.stringify(theme)});\n${corrected}`;
  }

  const hasUndo =
    (/\bapi\.startUndo(?:Group)?\s*\(/.test(corrected) &&
      /\btry\s*\{/.test(corrected) &&
      /\bfinally\s*\{/.test(corrected) &&
      /\bapi\.endUndo(?:Group)?\s*\(/.test(corrected)) ||
    /\b_mg\.undoGroup\s*\(/.test(corrected);

  if (!hasUndo) {
    if (options.useMgUndoGroup) {
      corrected = `_mg.undoGroup({\n  name: "Astryx Self-Corrected Scene",\n  operations: () => {\n${corrected}\n  }\n});`;
    } else {
      corrected = `api.startUndo("Astryx Self-Corrected Scene");\ntry {\n${corrected}\n} finally {\n  api.endUndo();\n}`;
    }
  }

  if (options.appendAutoFixComment !== false && initial.autoFixPrompt) {
    corrected = `// [autoFixPrompt] ${initial.autoFixPrompt}\n${corrected}`;
  }

  const finalValidation = validateMgPurity(corrected);
  return {
    correctedScript: corrected,
    initialValidation: initial,
    finalValidation,
    selfCorrected: true,
  };
}

export default validateMgPurity;
