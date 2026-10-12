// Test support for the dependency boundary (#31, #26, ADR 0020): which packages
// a source file imports, and whether it uses the browser's native confirm
// dialog. Parses the source with the TypeScript compiler, so comments and
// strings are never mistaken for code. Test-only; never imported by app code.
import ts from "typescript";

const parse = (code: string) =>
  ts.createSourceFile("source.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** "@scope/name/sub/path" -> "@scope/name"; "name/sub/path" -> "name". */
const packageName = (specifier: string) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

/** True for a specifier that names a package, not a file in this project. */
const isPackage = (specifier: string) => !specifier.startsWith(".") && !specifier.startsWith("@/");

/** The browser's global object under the names code can reach it by. */
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);

/**
 * Uses of the browser's native confirm dialog (ADR 0020 replaces it with an
 * in-page Alert Dialog): a bare `confirm(...)` call, and `confirm` read from
 * `window`, `globalThis` or `self`, called or not, by dot or by `["confirm"]`.
 */
export function findNativeConfirm(code: string): string[] {
  const findings: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "confirm") {
      findings.push("confirm(");
    }
    const member = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    if (
      member === "confirm" &&
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text)
    ) {
      findings.push(`${node.expression.text}.confirm`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(code));
  return findings;
}

/** The package of every bare import, re-export and dynamic import, in source order. */
export function packagesImportedBy(code: string): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) specifiers.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(code));
  return specifiers.filter(isPackage).map(packageName);
}
