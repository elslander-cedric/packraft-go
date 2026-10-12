// Test support for ADR 0013 (#26): finds user-facing text written directly in
// JSX instead of coming from the strings module. Parses the source with the
// TypeScript compiler, so generics, arrow functions and other code are never
// mistaken for text. Test-only; never imported by app code.
import ts from "typescript";

/** Attributes whose value is shown to the user or read out by a screen reader. */
const VISIBLE_ATTRIBUTES = new Set([
  "title",
  "alt",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

/** True when the text contains a letter once HTML entities such as `&nbsp;` are removed. */
const hasWords = (text: string) => /\p{L}/u.test(text.replace(/&(#?\w+);/g, ""));

/**
 * The literal text an expression can render: string literals, the fixed parts
 * of template literals, and these inside the branches of `? :`, `&&`, `||`
 * and `??`. Conditions and comparisons are not rendered, so they are skipped.
 */
function renderedLiterals(expression: ts.Expression): string[] {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
  }
  if (ts.isParenthesizedExpression(expression)) return renderedLiterals(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [...renderedLiterals(expression.whenTrue), ...renderedLiterals(expression.whenFalse)];
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return renderedLiterals(expression.right);
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return [...renderedLiterals(expression.left), ...renderedLiterals(expression.right)];
    }
  }
  return [];
}

/** Hard-coded user-facing text in a .tsx source, one entry per finding. */
export function findHardCodedText(code: string): string[] {
  const source = ts.createSourceFile("component.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) findings.push(`text "${node.text.trim()}"`);
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const text of renderedLiterals(node.expression)) if (hasWords(text)) findings.push(`text "${text}"`);
    }
    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
      const value = node.initializer;
      const texts = ts.isStringLiteral(value)
        ? [value.text]
        : ts.isJsxExpression(value) && value.expression
          ? renderedLiterals(value.expression)
          : [];
      for (const text of texts) if (hasWords(text)) findings.push(`${node.name.getText(source)}="${text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}
