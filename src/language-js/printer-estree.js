"use strict";

const assert = require("assert");

// TODO(azz): anything that imports from main shouldn't be in a `language-*` dir.
const comments = require("../main/comments");
const {
  getParentExportDeclaration,
  isExportDeclaration,
  shouldFlatten,
  getNextNonSpaceNonCommentCharacter,
  hasNewline,
  hasNewlineInRange,
  getLast,
  getStringWidth,
  printString,
  printNumber,
  hasIgnoreComment,
  hasNodeIgnoreComment,
  getPenultimate,
  startsWithNoLookaheadToken,
  getIndentSize,
  matchAncestorTypes,
  getPreferredQuote
} = require("../common/util");
const {
  isNextLineEmpty,
  isNextLineEmptyAfterIndex,
  getNextNonSpaceNonCommentCharacterIndex
} = require("../common/util-shared");
const embed = require("./embed");
const clean = require("./clean");
const insertPragma = require("./pragma").insertPragma;
const handleComments = require("./comments");
const pathNeedsParens = require("./needs-parens");
const {
  printHtmlBinding,
  isVueEventBindingExpression
} = require("./html-binding");
const preprocess = require("./preprocess");
const {
  classChildNeedsASIProtection,
  classPropMayCauseASIProblems,
  conditionalExpressionChainContainsJSX,
  getFlowVariance,
  getLeftSidePathName,
  getTypeScriptMappedTypeModifier,
  hasDanglingComments,
  hasFlowAnnotationComment,
  hasFlowShorthandAnnotationComment,
  hasLeadingComment,
  hasLeadingOwnLineComment,
  hasNakedLeftSide,
  hasNewlineBetweenOrAfterDecorators,
  hasNgSideEffect,
  hasPrettierIgnore,
  hasTrailingComment,
  identity,
  isBinaryish,
  isCallOrOptionalCallExpression,
  isEmptyJSXElement,
  isFlowAnnotationComment,
  isFunctionCompositionArgs,
  isFunctionNotation,
  isFunctionOrArrowExpression,
  isGetterOrSetter,
  isJestEachTemplateLiteral,
  isJSXNode,
  isJSXWhitespaceExpression,
  isLastStatement,
  isLiteral,
  isLongCurriedCallExpression,
  isMeaningfulJSXText,
  isMemberExpressionChain,
  isMemberish,
  isNgForOf,
  isNumericLiteral,
  isObjectType,
  isObjectTypePropertyAFunction,
  isSimpleFlowType,
  isSimpleTemplateLiteral,
  isStringLiteral,
  isStringPropSafeToCoerceToIdentifier,
  isTemplateOnItsOwnLine,
  isTestCall,
  isTheOnlyJSXElementInMarkdown,
  isTSXFile,
  isTypeAnnotationAFunction,
  matchJsxWhitespaceRegex,
  needsHardlineAfterDanglingComment,
  rawText,
  returnArgumentHasLeadingComment
} = require("./utils");

const needsQuoteProps = new WeakMap();

const {
  builders: {
    concat,
    join,
    line,
    hardline,
    softline,
    literalline,
    group,
    indent,
    align,
    conditionalGroup,
    fill,
    ifBreak,
    breakParent,
    lineSuffixBoundary,
    addAlignmentToDoc,
    dedent
  },
  utils: { willBreak, isLineNext, isEmpty, removeLines },
  printer: { printDocToString }
} = require("../doc");

let uid = 0;

function shouldPrintComma(options, level) {
  level = level || "es5";

  switch (options.trailingComma) {
    case "all":
      if (level === "all") {
        return true;
      }
    // fallthrough
    case "es5":
      if (level === "es5") {
        return true;
      }
    // fallthrough
    case "none":
    default:
      return false;
  }
}

function genericPrint(path, options, printPath, args) {
  const node = path.getValue();
  let needsParens = false;
  const linesWithoutParens = printPathNoParens(path, options, printPath, args);

  if (!node || isEmpty(linesWithoutParens)) {
    return linesWithoutParens;
  }

  const parentExportDecl = getParentExportDeclaration(path);
  const decorators = [];
  if (
    node.type === "ClassMethod" ||
    node.type === "ClassPrivateMethod" ||
    node.type === "ClassProperty" ||
    node.type === "TSAbstractClassProperty" ||
    node.type === "ClassPrivateProperty" ||
    node.type === "MethodDefinition" ||
    node.type === "TSAbstractMethodDefinition"
  ) {
    // their decorators are handled themselves
  } else if (
    node.decorators &&
    node.decorators.length > 0 &&
    // If the parent node is an export declaration and the decorator
    // was written before the export, the export will be responsible
    // for printing the decorators.
    !(
      parentExportDecl &&
      options.locStart(parentExportDecl, { ignoreDecorators: true }) >
        options.locStart(node.decorators[0])
    )
  ) {
    const shouldBreak =
      node.type === "ClassExpression" ||
      node.type === "ClassDeclaration" ||
      hasNewlineBetweenOrAfterDecorators(node, options);

    const separator = shouldBreak ? hardline : line;

    path.each(decoratorPath => {
      let decorator = decoratorPath.getValue();
      if (decorator.expression) {
        decorator = decorator.expression;
      } else {
        decorator = decorator.callee;
      }

      decorators.push(printPath(decoratorPath), separator);
    }, "decorators");

    if (parentExportDecl) {
      decorators.unshift(hardline);
    }
  } else if (
    isExportDeclaration(node) &&
    node.declaration &&
    node.declaration.decorators &&
    node.declaration.decorators.length > 0 &&
    // Only print decorators here if they were written before the export,
    // otherwise they are printed by the node.declaration
    options.locStart(node, { ignoreDecorators: true }) >
      options.locStart(node.declaration.decorators[0])
  ) {
    // Export declarations are responsible for printing any decorators
    // that logically apply to node.declaration.
    path.each(
      decoratorPath => {
        const decorator = decoratorPath.getValue();
        const prefix = decorator.type === "Decorator" ? "" : "@";
        decorators.push(prefix, printPath(decoratorPath), hardline);
      },
      "declaration",
      "decorators"
    );
  } else {
    // Nodes with decorators can't have parentheses, so we can avoid
    // computing pathNeedsParens() except in this case.
    needsParens = pathNeedsParens(path, options);
  }

  const parts = [];
  if (needsParens) {
    parts.unshift("(");
  }

  parts.push(linesWithoutParens);

  if (needsParens) {
    const node = path.getValue();
    if (hasFlowShorthandAnnotationComment(node)) {
      parts.push(" /*");
      parts.push(node.trailingComments[0].value.trimLeft());
      parts.push("*/");
      node.trailingComments[0].printed = true;
    }

    parts.push(")");
  }

  if (decorators.length > 0) {
    return group(concat(decorators.concat(parts)));
  }
  return concat(parts);
}

function printDecorators(path, options, print) {
  const node = path.getValue();
  return group(
    concat([
      join(line, path.map(print, "decorators")),
      hasNewlineBetweenOrAfterDecorators(node, options) ? hardline : line
    ])
  );
}

/**
 * The following is the shared logic for
 * ternary operators, namely ConditionalExpression
 * and TSConditionalType
 * @typedef {Object} OperatorOptions
 * @property {() => Array<string | Doc>} beforeParts - Parts to print before the `?`.
 * @property {(breakClosingParen: boolean) => Array<string | Doc>} afterParts - Parts to print after the conditional expression.
 * @property {boolean} shouldCheckJsx - Whether to check for and print in JSX mode.
 * @property {string} conditionalNodeType - The type of the conditional expression node, ie "ConditionalExpression" or "TSConditionalType".
 * @property {string} consequentNodePropertyName - The property at which the consequent node can be found on the main node, eg "consequent".
 * @property {string} alternateNodePropertyName - The property at which the alternate node can be found on the main node, eg "alternate".
 * @property {string} testNodePropertyName - The property at which the test node can be found on the main node, eg "test".
 * @property {boolean} breakNested - Whether to break all nested ternaries when one breaks.
 * @param {FastPath} path - The path to the ConditionalExpression/TSConditionalType node.
 * @param {Options} options - Prettier options
 * @param {Function} print - Print function to call recursively
 * @param {OperatorOptions} operatorOptions
 * @returns Doc
 */
function printTernaryOperator(path, options, print, operatorOptions) {
  const node = path.getValue();
  const testNode = node[operatorOptions.testNodePropertyName];
  const consequentNode = node[operatorOptions.consequentNodePropertyName];
  const alternateNode = node[operatorOptions.alternateNodePropertyName];
  const parts = [];

  // We print a ConditionalExpression in either "JSX mode" or "normal mode".
  // See tests/jsx/conditional-expression.js for more info.
  let jsxMode = false;
  const parent = path.getParentNode();
  let forceNoIndent = parent.type === operatorOptions.conditionalNodeType;

  // Find the outermost non-ConditionalExpression parent, and the outermost
  // ConditionalExpression parent. We'll use these to determine if we should
  // print in JSX mode.
  let currentParent;
  let previousParent;
  let i = 0;
  do {
    previousParent = currentParent || node;
    currentParent = path.getParentNode(i);
    i++;
  } while (
    currentParent &&
    currentParent.type === operatorOptions.conditionalNodeType
  );
  const firstNonConditionalParent = currentParent || parent;
  const lastConditionalParent = previousParent;

  if (
    operatorOptions.shouldCheckJsx &&
    (isJSXNode(testNode) ||
      isJSXNode(consequentNode) ||
      isJSXNode(alternateNode) ||
      conditionalExpressionChainContainsJSX(lastConditionalParent))
  ) {
    jsxMode = true;
    forceNoIndent = true;

    // Even though they don't need parens, we wrap (almost) everything in
    // parens when using ?: within JSX, because the parens are analogous to
    // curly braces in an if statement.
    const wrap = doc =>
      concat([
        ifBreak("(", ""),
        indent(concat([softline, doc])),
        softline,
        ifBreak(")", "")
      ]);

    // The only things we don't wrap are:
    // * Nested conditional expressions in alternates
    // * null
    const isNull = node =>
      node.type === "NullLiteral" ||
      (node.type === "Literal" && node.value === null);

    parts.push(
      " ? ",
      isNull(consequentNode)
        ? path.call(print, operatorOptions.consequentNodePropertyName)
        : wrap(path.call(print, operatorOptions.consequentNodePropertyName)),
      " : ",
      alternateNode.type === operatorOptions.conditionalNodeType ||
        isNull(alternateNode)
        ? path.call(print, operatorOptions.alternateNodePropertyName)
        : wrap(path.call(print, operatorOptions.alternateNodePropertyName))
    );
  } else {
    // normal mode
    const part = concat([
      line,
      "? ",
      consequentNode.type === operatorOptions.conditionalNodeType
        ? ifBreak("", "(")
        : "",
      align(2, path.call(print, operatorOptions.consequentNodePropertyName)),
      consequentNode.type === operatorOptions.conditionalNodeType
        ? ifBreak("", ")")
        : "",
      line,
      ": ",
      alternateNode.type === operatorOptions.conditionalNodeType
        ? path.call(print, operatorOptions.alternateNodePropertyName)
        : align(2, path.call(print, operatorOptions.alternateNodePropertyName))
    ]);
    parts.push(
      parent.type !== operatorOptions.conditionalNodeType ||
        parent[operatorOptions.alternateNodePropertyName] === node
        ? part
        : options.useTabs
        ? dedent(indent(part))
        : align(Math.max(0, options.tabWidth - 2), part)
    );
  }

  // We want a whole chain of ConditionalExpressions to all
  // break if any of them break. That means we should only group around the
  // outer-most ConditionalExpression.
  const maybeGroup = doc =>
    operatorOptions.breakNested
      ? parent === firstNonConditionalParent
        ? group(doc)
        : doc
      : group(doc);

  // Break the closing paren to keep the chain right after it:
  // (a
  //   ? b
  //   : c
  // ).call()
  const breakClosingParen =
    !jsxMode &&
    (parent.type === "MemberExpression" ||
      parent.type === "OptionalMemberExpression" ||
      (parent.type === "NGPipeExpression" &&
        parent.left === node &&
        operatorOptions.breakNested)) &&
    !parent.computed;

  return maybeGroup(
    concat(
      [].concat(
        (testDoc =>
          /**
           *     a
           *       ? b
           *       : multiline
           *         test
           *         node
           *       ^^ align(2)
           *       ? d
           *       : e
           */
          parent.type === operatorOptions.conditionalNodeType &&
          parent[operatorOptions.alternateNodePropertyName] === node
            ? align(2, testDoc)
            : testDoc)(concat(operatorOptions.beforeParts())),
        forceNoIndent ? concat(parts) : indent(concat(parts)),
        operatorOptions.afterParts(breakClosingParen)
      )
    )
  );
}

function printPathNoParens(path, options, print, args) {
  const n = path.getValue();
  const semi = options.semi ? ";" : "";

  if (!n) {
    return "";
  }

  if (typeof n === "string") {
    return n;
  }

  const htmlBinding = printHtmlBinding(path, options, print);
  if (htmlBinding) {
    return htmlBinding;
  }

  let parts = [];
  switch (n.type) {
    case "JsExpressionRoot":
      return path.call(print, "node");
    case "JsonRoot":
      return concat([path.call(print, "node"), hardline]);
    case "File":
      // Print @babel/parser's InterpreterDirective here so that
      // leading comments on the `Program` node get printed after the hashbang.
      if (n.program && n.program.interpreter) {
        parts.push(
          path.call(
            programPath => programPath.call(print, "interpreter"),
            "program"
          )
        );
      }

      parts.push(path.call(print, "program"));

      return concat(parts);

    case "Program":
      // Babel 6
      if (n.directives) {
        path.each(childPath => {
          parts.push(print(childPath), semi, hardline);
          if (
            isNextLineEmpty(options.originalText, childPath.getValue(), options)
          ) {
            parts.push(hardline);
          }
        }, "directives");
      }

      parts.push(
        path.call(bodyPath => {
          return printStatementSequence(bodyPath, options, print);
        }, "body")
      );

      parts.push(
        comments.printDanglingComments(path, options, /* sameIndent */ true)
      );

      // Only force a trailing newline if there were any contents.
      if (n.body.length || n.comments) {
        parts.push(hardline);
      }

      return concat(parts);
    // Babel extension.
    case "EmptyStatement":
      return "";
    case "ExpressionStatement":
      // Detect Flow-parsed directives
      if (n.directive) {
        return concat([nodeStr(n.expression, options, true), semi]);
      }

      if (options.parser === "__vue_event_binding") {
        const parent = path.getParentNode();
        if (
          parent.type === "Program" &&
          parent.body.length === 1 &&
          parent.body[0] === n
        ) {
          return concat([
            path.call(print, "expression"),
            isVueEventBindingExpression(n.expression) ? ";" : ""
          ]);
        }
      }

      // Do not append semicolon after the only JSX element in a program
      return concat([
        path.call(print, "expression"),
        isTheOnlyJSXElementInMarkdown(options, path) ? "" : semi
      ]); // Babel extension.
    case "ParenthesizedExpression":
      return concat(["(", path.call(print, "expression"), ")"]);
    case "AssignmentExpression":
      return printAssignment(
        n.left,
        path.call(print, "left"),
        concat([" ", n.operator]),
        n.right,
        path.call(print, "right"),
        options
      );
    case "BinaryExpression":
    case "LogicalExpression":
    case "NGPipeExpression": {
      const parent = path.getParentNode();
      const parentParent = path.getParentNode(1);
      const isInsideParenthesis =
        n !== parent.body &&
        (parent.type === "IfStatement" ||
          parent.type === "WhileStatement" ||
          parent.type === "SwitchStatement" ||
          parent.type === "DoWhileStatement");

      const parts = printBinaryishExpressions(
        path,
        print,
        options,
        /* isNested */ false,
        isInsideParenthesis
      );

      //   if (
      //     this.hasPlugin("dynamicImports") && this.lookahead().type === tt.parenLeft
      //   ) {
      //
      // looks super weird, we want to break the children if the parent breaks
      //
      //   if (
      //     this.hasPlugin("dynamicImports") &&
      //     this.lookahead().type === tt.parenLeft
      //   ) {
      if (isInsideParenthesis) {
        return concat(parts);
      }

      // Break between the parens in
      // unaries or in a member or specific call expression, i.e.
      //
      //   (
      //     a &&
      //     b &&
      //     c
      //   ).call()
      if (
        ((parent.type === "CallExpression" ||
          parent.type === "OptionalCallExpression") &&
          parent.callee === n) ||
        parent.type === "UnaryExpression" ||
        ((parent.type === "MemberExpression" ||
          parent.type === "OptionalMemberExpression") &&
          !parent.computed)
      ) {
        return group(
          concat([indent(concat([softline, concat(parts)])), softline])
        );
      }

      // Avoid indenting sub-expressions in some cases where the first sub-expression is already
      // indented accordingly. We should indent sub-expressions where the first case isn't indented.
      const shouldNotIndent =
        parent.type === "ReturnStatement" ||
        (parent.type === "JSXExpressionContainer" &&
          parentParent.type === "JSXAttribute") ||
        (n.type !== "NGPipeExpression" &&
          ((parent.type === "NGRoot" && options.parser === "__ng_binding") ||
            (parent.type === "NGMicrosyntaxExpression" &&
              parentParent.type === "NGMicrosyntax" &&
              parentParent.body.length === 1))) ||
        (n === parent.body && parent.type === "ArrowFunctionExpression") ||
        (n !== parent.body && parent.type === "ForStatement") ||
        (parent.type === "ConditionalExpression" &&
          parentParent.type !== "ReturnStatement" &&
          parentParent.type !== "CallExpression" &&
          parentParent.type !== "OptionalCallExpression");

      const shouldIndentIfInlining =
        parent.type === "AssignmentExpression" ||
        parent.type === "VariableDeclarator" ||
        parent.type === "ClassProperty" ||
        parent.type === "TSAbstractClassProperty" ||
        parent.type === "ClassPrivateProperty" ||
        parent.type === "ObjectProperty" ||
        parent.type === "Property";

      const samePrecedenceSubExpression =
        isBinaryish(n.left) && shouldFlatten(n.operator, n.left.operator);

      if (
        shouldNotIndent ||
        (shouldInlineLogicalExpression(n) && !samePrecedenceSubExpression) ||
        (!shouldInlineLogicalExpression(n) && shouldIndentIfInlining)
      ) {
        return group(concat(parts));
      }

      if (parts.length === 0) {
        return "";
      }

      // If the right part is a JSX node, we include it in a separate group to
      // prevent it breaking the whole chain, so we can print the expression like:
      //
      //   foo && bar && (
      //     <Foo>
      //       <Bar />
      //     </Foo>
      //   )

      const hasJSX = isJSXNode(n.right);
      const rest = concat(hasJSX ? parts.slice(1, -1) : parts.slice(1));

      const groupId = Symbol("logicalChain-" + ++uid);
      const chain = group(
        concat([
          // Don't include the initial expression in the indentation
          // level. The first item is guaranteed to be the first
          // left-most expression.
          parts.length > 0 ? parts[0] : "",
          indent(rest)
        ]),
        { id: groupId }
      );

      if (!hasJSX) {
        return chain;
      }

      const jsxPart = getLast(parts);
      return group(
        concat([chain, ifBreak(indent(jsxPart), jsxPart, { groupId })])
      );
    }
    case "AssignmentPattern":
      return concat([
        path.call(print, "left"),
        " = ",
        path.call(print, "right")
      ]);
    case "TSTypeAssertion": {
      const shouldBreakAfterCast = !(
        n.expression.type === "ArrayExpression" ||
        n.expression.type === "ObjectExpression"
      );

      const castGroup = group(
        concat([
          "<",
          indent(concat([softline, path.call(print, "typeAnnotation")])),
          softline,
          ">"
        ])
      );

      const exprContents = concat([
        ifBreak("("),
        indent(concat([softline, path.call(print, "expression")])),
        softline,
        ifBreak(")")
      ]);

      if (shouldBreakAfterCast) {
        return conditionalGroup([
          concat([castGroup, path.call(print, "expression")]),
          concat([castGroup, group(exprContents, { shouldBreak: true })]),
          concat([castGroup, path.call(print, "expression")])
        ]);
      }
      return group(concat([castGroup, path.call(print, "expression")]));
    }
    case "OptionalMemberExpression":
    case "MemberExpression": {
      const parent = path.getParentNode();
      let firstNonMemberParent;
      let i = 0;
      do {
        firstNonMemberParent = path.getParentNode(i);
        i++;
      } while (
        firstNonMemberParent &&
        (firstNonMemberParent.type === "MemberExpression" ||
          firstNonMemberParent.type === "OptionalMemberExpression" ||
          firstNonMemberParent.type === "TSNonNullExpression")
      );

      const shouldInline =
        (firstNonMemberParent &&
          (firstNonMemberParent.type === "NewExpression" ||
            firstNonMemberParent.type === "BindExpression" ||
            (firstNonMemberParent.type === "VariableDeclarator" &&
              firstNonMemberParent.id.type !== "Identifier") ||
            (firstNonMemberParent.type === "AssignmentExpression" &&
              firstNonMemberParent.left.type !== "Identifier"))) ||
        n.computed ||
        (n.object.type === "Identifier" &&
          n.property.type === "Identifier" &&
          parent.type !== "MemberExpression" &&
          parent.type !== "OptionalMemberExpression");

      return concat([
        path.call(print, "object"),
        shouldInline
          ? printMemberLookup(path, options, print)
          : group(
              indent(
                concat([softline, printMemberLookup(path, options, print)])
              )
            )
      ]);
    }
    case "MetaProperty":
      return concat([
        path.call(print, "meta"),
        ".",
        path.call(print, "property")
      ]);
    case "BindExpression":
      if (n.object) {
        parts.push(path.call(print, "object"));
      }

      parts.push(
        group(
          indent(
            concat([softline, printBindExpressionCallee(path, options, print)])
          )
        )
      );

      return concat(parts);
    case "Identifier": {
      return concat([
        n.name,
        printOptionalToken(path),
        printTypeAnnotation(path, options, print)
      ]);
    }
    case "V8IntrinsicIdentifier":
      return concat(["%", n.name]);
    case "SpreadElement":
    case "SpreadElementPattern":
    case "RestProperty":
    case "SpreadProperty":
    case "SpreadPropertyPattern":
    case "RestElement":
    case "ObjectTypeSpreadProperty":
      return concat([
        "...",
        path.call(print, "argument"),
        printTypeAnnotation(path, options, print)
      ]);
    case "FunctionDeclaration":
    case "FunctionExpression":
      parts.push(printFunctionDeclaration(path, print, options));
      if (!n.body) {
        parts.push(semi);
      }
      return concat(parts);
    case "ArrowFunctionExpression": {
      if (n.async) {
        parts.push("async ");
      }

      if (shouldPrintParamsWithoutParens(path, options)) {
        parts.push(path.call(print, "params", 0));
      } else {
        parts.push(
          group(
            concat([
              printFunctionParams(
                path,
                print,
                options,
                /* expandLast */ args &&
                  (args.expandLastArg || args.expandFirstArg),
                /* printTypeParams */ true
              ),
              printReturnType(path, print, options)
            ])
          )
        );
      }

      const dangling = comments.printDanglingComments(
        path,
        options,
        /* sameIndent */ true,
        comment => {
          const nextCharacter = getNextNonSpaceNonCommentCharacterIndex(
            options.originalText,
            comment,
            options
          );
          return options.originalText.substr(nextCharacter, 2) === "=>";
        }
      );
      if (dangling) {
        parts.push(" ", dangling);
      }

      parts.push(" =>");

      const body = path.call(bodyPath => print(bodyPath, args), "body");

      // We want to always keep these types of nodes on the same line
      // as the arrow.
      if (
        !hasLeadingOwnLineComment(options.originalText, n.body, options) &&
        (n.body.type === "ArrayExpression" ||
          n.body.type === "ObjectExpression" ||
          n.body.type === "BlockStatement" ||
          isJSXNode(n.body) ||
          isTemplateOnItsOwnLine(n.body, options.originalText, options) ||
          n.body.type === "ArrowFunctionExpression" ||
          n.body.type === "DoExpression")
      ) {
        return group(concat([concat(parts), " ", body]));
      }

      // We handle sequence expressions as the body of arrows specially,
      // so that the required parentheses end up on their own lines.
      if (n.body.type === "SequenceExpression") {
        return group(
          concat([
            concat(parts),
            group(
              concat([" (", indent(concat([softline, body])), softline, ")"])
            )
          ])
        );
      }

      // if the arrow function is expanded as last argument, we are adding a
      // level of indentation and need to add a softline to align the closing )
      // with the opening (, or if it's inside a JSXExpression (e.g. an attribute)
      // we should align the expression's closing } with the line with the opening {.
      const shouldAddSoftLine =
        ((args && args.expandLastArg) ||
          path.getParentNode().type === "JSXExpressionContainer") &&
        !(n.comments && n.comments.length);

      const printTrailingComma =
        args && args.expandLastArg && shouldPrintComma(options, "all");

      // In order to avoid confusion between
      // a => a ? a : a
      // a <= a ? a : a
      const shouldAddParens =
        n.body.type === "ConditionalExpression" &&
        !startsWithNoLookaheadToken(n.body, /* forbidFunctionAndClass */ false);

      return group(
        concat([
          concat(parts),
          group(
            concat([
              indent(
                concat([
                  line,
                  shouldAddParens ? ifBreak("", "(") : "",
                  body,
                  shouldAddParens ? ifBreak("", ")") : ""
                ])
              ),
              shouldAddSoftLine
                ? concat([ifBreak(printTrailingComma ? "," : ""), softline])
                : ""
            ])
          )
        ])
      );
    }
    case "YieldExpression":
      parts.push("yield");

      if (n.delegate) {
        parts.push("*");
      }
      if (n.argument) {
        parts.push(" ", path.call(print, "argument"));
      }

      return concat(parts);
    case "AwaitExpression": {
      parts.push("await ", path.call(print, "argument"));
      const parent = path.getParentNode();
      if (
        ((parent.type === "CallExpression" ||
          parent.type === "OptionalCallExpression") &&
          parent.callee === n) ||
        ((parent.type === "MemberExpression" ||
          parent.type === "OptionalMemberExpression") &&
          parent.object === n)
      ) {
        return group(
          concat([indent(concat([softline, concat(parts)])), softline])
        );
      }
      return concat(parts);
    }
    case "ImportSpecifier":
      if (n.importKind) {
        parts.push(path.call(print, "importKind"), " ");
      }

      parts.push(path.call(print, "imported"));

      if (n.local && n.local.name !== n.imported.name) {
        parts.push(" as ", path.call(print, "local"));
      }

      return concat(parts);
    case "ExportSpecifier":
      parts.push(path.call(print, "local"));

      if (n.exported && n.exported.name !== n.local.name) {
        parts.push(" as ", path.call(print, "exported"));
      }

      return concat(parts);
    case "ImportNamespaceSpecifier":
      parts.push("* as ");
      parts.push(path.call(print, "local"));
      return concat(parts);
    case "ImportDefaultSpecifier":
      return path.call(print, "local");
    case "TSExportAssignment":
      return concat(["export = ", path.call(print, "expression"), semi]);
    case "ExportDefaultDeclaration":
    case "ExportNamedDeclaration":
      return printExportDeclaration(path, options, print);
    case "ExportAllDeclaration":
      parts.push("export ");

      if (n.exportKind === "type") {
        parts.push("type ");
      }

      parts.push("* from ", path.call(print, "source"), semi);

      return concat(parts);

    case "ExportNamespaceSpecifier":
    case "ExportDefaultSpecifier":
      return path.call(print, "exported");
    case "ImportDeclaration": {
      parts.push("import ");

      if (n.importKind && n.importKind !== "value") {
        parts.push(n.importKind + " ");
      }

      const standalones = [];
      const grouped = [];
      if (n.specifiers && n.specifiers.length > 0) {
        path.each(specifierPath => {
          const value = specifierPath.getValue();
          if (
            value.type === "ImportDefaultSpecifier" ||
            value.type === "ImportNamespaceSpecifier"
          ) {
            standalones.push(print(specifierPath));
          } else {
            grouped.push(print(specifierPath));
          }
        }, "specifiers");

        if (standalones.length > 0) {
          parts.push(join(", ", standalones));
        }

        if (standalones.length > 0 && grouped.length > 0) {
          parts.push(", ");
        }

        if (
          grouped.length === 1 &&
          standalones.length === 0 &&
          n.specifiers &&
          !n.specifiers.some(node => node.comments)
        ) {
          parts.push(
            concat([
              "{",
              options.bracketSpacing ? " " : "",
              concat(grouped),
              options.bracketSpacing ? " " : "",
              "}"
            ])
          );
        } else if (grouped.length >= 1) {
          parts.push(
            group(
              concat([
                "{",
                indent(
                  concat([
                    options.bracketSpacing ? line : softline,
                    join(concat([",", line]), grouped)
                  ])
                ),
                ifBreak(shouldPrintComma(options) ? "," : ""),
                options.bracketSpacing ? line : softline,
                "}"
              ])
            )
          );
        }

        parts.push(" from ");
      } else if (
        (n.importKind && n.importKind === "type") ||
        // import {} from 'x'
        /{\s*}/.test(
          options.originalText.slice(
            options.locStart(n),
            options.locStart(n.source)
          )
        )
      ) {
        parts.push("{} from ");
      }

      parts.push(path.call(print, "source"), semi);

      return concat(parts);
    }

    case "Import":
      return "import";
    case "TSModuleBlock":
    case "BlockStatement": {
      const naked = path.call(bodyPath => {
        return printStatementSequence(bodyPath, options, print);
      }, "body");

      const hasContent = n.body.find(node => node.type !== "EmptyStatement");
      const hasDirectives = n.directives && n.directives.length > 0;

      const parent = path.getParentNode();
      const parentParent = path.getParentNode(1);
      if (
        !hasContent &&
        !hasDirectives &&
        !hasDanglingComments(n) &&
        (parent.type === "ArrowFunctionExpression" ||
          parent.type === "FunctionExpression" ||
          parent.type === "FunctionDeclaration" ||
          parent.type === "ObjectMethod" ||
          parent.type === "ClassMethod" ||
          parent.type === "ClassPrivateMethod" ||
          parent.type === "ForStatement" ||
          parent.type === "WhileStatement" ||
          parent.type === "DoWhileStatement" ||
          parent.type === "DoExpression" ||
          (parent.type === "CatchClause" && !parentParent.finalizer) ||
          parent.type === "TSModuleDeclaration")
      ) {
        return "{}";
      }

      parts.push("{");

      // Babel 6
      if (hasDirectives) {
        path.each(childPath => {
          parts.push(indent(concat([hardline, print(childPath), semi])));
          if (
            isNextLineEmpty(options.originalText, childPath.getValue(), options)
          ) {
            parts.push(hardline);
          }
        }, "directives");
      }

      if (hasContent) {
        parts.push(indent(concat([hardline, naked])));
      }

      parts.push(comments.printDanglingComments(path, options));
      parts.push(hardline, "}");

      return concat(parts);
    }
    case "ReturnStatement":
      parts.push("return");

      if (n.argument) {
        if (returnArgumentHasLeadingComment(options, n.argument)) {
          parts.push(
            concat([
              " (",
              indent(concat([hardline, path.call(print, "argument")])),
              hardline,
              ")"
            ])
          );
        } else if (
          n.argument.type === "LogicalExpression" ||
          n.argument.type === "BinaryExpression" ||
          n.argument.type === "SequenceExpression"
        ) {
          parts.push(
            group(
              concat([
                ifBreak(" (", " "),
                indent(concat([softline, path.call(print, "argument")])),
                softline,
                ifBreak(")")
              ])
            )
          );
        } else {
          parts.push(" ", path.call(print, "argument"));
        }
      }

      if (hasDanglingComments(n)) {
        parts.push(
          " ",
          comments.printDanglingComments(path, options, /* sameIndent */ true)
        );
      }

      parts.push(semi);

      return concat(parts);
    case "NewExpression":
    case "OptionalCallExpression":
    case "CallExpression": {
      const isNew = n.type === "NewExpression";

      const optional = printOptionalToken(path);
      if (
        // We want to keep CommonJS- and AMD-style require calls, and AMD-style
        // define calls, as a unit.
        // e.g. `define(["some/lib", (lib) => {`
        (!isNew &&
          n.callee.type === "Identifier" &&
          (n.callee.name === "require" || n.callee.name === "define")) ||
        // Template literals as single arguments
        (n.arguments.length === 1 &&
          isTemplateOnItsOwnLine(
            n.arguments[0],
            options.originalText,
            options
          )) ||
        // Keep test declarations on a single line
        // e.g. `it('long name', () => {`
        (!isNew && isTestCall(n, path.getParentNode()))
      ) {
        return concat([
          isNew ? "new " : "",
          path.call(print, "callee"),
          optional,
          printFunctionTypeParameters(path, options, print),
          concat(["(", join(", ", path.map(print, "arguments")), ")"])
        ]);
      }

      // Inline Flow annotation comments following Identifiers in Call nodes need to
      // stay with the Identifier. For example:
      //
      // foo /*:: <SomeGeneric> */(bar);
      //
      // Here, we ensure that such comments stay between the Identifier and the Callee.
      const isIdentifierWithFlowAnnotation =
        n.callee.type === "Identifier" &&
        hasFlowAnnotationComment(n.callee.trailingComments);
      if (isIdentifierWithFlowAnnotation) {
        n.callee.trailingComments[0].printed = true;
      }

      // We detect calls on member lookups and possibly print them in a
      // special chain format. See `printMemberChain` for more info.
      if (!isNew && isMemberish(n.callee)) {
        return printMemberChain(path, options, print);
      }

      const contents = concat([
        isNew ? "new " : "",
        path.call(print, "callee"),
        optional,
        isIdentifierWithFlowAnnotation
          ? `/*:: ${n.callee.trailingComments[0].value.substring(2).trim()} */`
          : "",
        printFunctionTypeParameters(path, options, print),
        printArgumentsList(path, options, print)
      ]);

      // We group here when the callee is itself a call expression.
      // See `isLongCurriedCallExpression` for more info.
      if (isCallOrOptionalCallExpression(n.callee)) {
        return group(contents);
      }

      return contents;
    }
    case "TSInterfaceDeclaration":
      if (n.declare) {
        parts.push("declare ");
      }

      parts.push(
        n.abstract ? "abstract " : "",
        printTypeScriptModifiers(path, options, print),
        "interface ",
        path.call(print, "id"),
        n.typeParameters ? path.call(print, "typeParameters") : "",
        " "
      );

      if (n.extends && n.extends.length) {
        parts.push(
          group(
            indent(
              concat([
                softline,
                "extends ",
                (n.extends.length === 1 ? identity : indent)(
                  join(concat([",", line]), path.map(print, "extends"))
                ),
                " "
              ])
            )
          )
        );
      }

      parts.push(path.call(print, "body"));

      return concat(parts);

    case "ObjectTypeInternalSlot":
      return concat([
        n.static ? "static " : "",
        "[[",
        path.call(print, "id"),
        "]]",
        printOptionalToken(path),
        n.method ? "" : ": ",
        path.call(print, "value")
      ]);

    case "ObjectExpression":
    case "ObjectPattern":
    case "ObjectTypeAnnotation":
    case "TSInterfaceBody":
    case "TSTypeLiteral": {
      let propertiesField;

      if (n.type === "TSTypeLiteral") {
        propertiesField = "members";
      } else if (n.type === "TSInterfaceBody") {
        propertiesField = "body";
      } else {
        propertiesField = "properties";
      }

      const isTypeAnnotation = n.type === "ObjectTypeAnnotation";
      const fields = [];
      if (isTypeAnnotation) {
        fields.push("indexers", "callProperties", "internalSlots");
      }
      fields.push(propertiesField);

      const firstProperty = fields
        .map(field => n[field][0])
        .sort((a, b) => options.locStart(a) - options.locStart(b))[0];

      const parent = path.getParentNode(0);
      const isFlowInterfaceLikeBody =
        isTypeAnnotation &&
        parent &&
        (parent.type === "InterfaceDeclaration" ||
          parent.type === "DeclareInterface" ||
          parent.type === "DeclareClass") &&
        path.getName() === "body";
      const shouldBreak =
        n.type === "TSInterfaceBody" ||
        isFlowInterfaceLikeBody ||
        (n.type === "ObjectPattern" &&
          parent.type !== "FunctionDeclaration" &&
          parent.type !== "FunctionExpression" &&
          parent.type !== "ArrowFunctionExpression" &&
          parent.type !== "ObjectMethod" &&
          parent.type !== "ClassMethod" &&
          parent.type !== "ClassPrivateMethod" &&
          parent.type !== "AssignmentPattern" &&
          parent.type !== "CatchClause" &&
          n.properties.some(
            property =>
              property.value &&
              (property.value.type === "ObjectPattern" ||
                property.value.type === "ArrayPattern")
          )) ||
        (n.type !== "ObjectPattern" &&
          firstProperty &&
          hasNewlineInRange(
            options.originalText,
            options.locStart(n),
            options.locStart(firstProperty)
          ));

      const separator = isFlowInterfaceLikeBody
        ? ";"
        : n.type === "TSInterfaceBody" || n.type === "TSTypeLiteral"
        ? ifBreak(semi, ";")
        : ",";
      const leftBrace = n.exact ? "{|" : "{";
      const rightBrace = n.exact ? "|}" : "}";

      // Unfortunately, things are grouped together in the ast can be
      // interleaved in the source code. So we need to reorder them before
      // printing them.
      const propsAndLoc = [];
      fields.forEach(field => {
        path.each(childPath => {
          const node = childPath.getValue();
          propsAndLoc.push({
            node: node,
            printed: print(childPath),
            loc: options.locStart(node)
          });
        }, field);
      });

      let separatorParts = [];
      const props = propsAndLoc
        .sort((a, b) => a.loc - b.loc)
        .map(prop => {
          const result = concat(separatorParts.concat(group(prop.printed)));
          separatorParts = [separator, line];
          if (
            (prop.node.type === "TSPropertySignature" ||
              prop.node.type === "TSMethodSignature" ||
              prop.node.type === "TSConstructSignatureDeclaration") &&
            hasNodeIgnoreComment(prop.node)
          ) {
            separatorParts.shift();
          }
          if (isNextLineEmpty(options.originalText, prop.node, options)) {
            separatorParts.push(hardline);
          }
          return result;
        });

      if (n.inexact) {
        props.push(concat(separatorParts.concat(group("..."))));
      }

      const lastElem = getLast(n[propertiesField]);

      const canHaveTrailingSeparator = !(
        lastElem &&
        (lastElem.type === "RestProperty" ||
          lastElem.type === "RestElement" ||
          hasNodeIgnoreComment(lastElem) ||
          n.inexact)
      );

      let content;
      if (props.length === 0) {
        if (!hasDanglingComments(n)) {
          return concat([
            leftBrace,
            rightBrace,
            printTypeAnnotation(path, options, print)
          ]);
        }

        content = group(
          concat([
            leftBrace,
            comments.printDanglingComments(path, options),
            softline,
            rightBrace,
            printOptionalToken(path),
            printTypeAnnotation(path, options, print)
          ])
        );
      } else {
        content = concat([
          leftBrace,
          indent(
            concat([options.bracketSpacing ? line : softline, concat(props)])
          ),
          ifBreak(
            canHaveTrailingSeparator &&
              (separator !== "," || shouldPrintComma(options))
              ? separator
              : ""
          ),
          concat([options.bracketSpacing ? line : softline, rightBrace]),
          printOptionalToken(path),
          printTypeAnnotation(path, options, print)
        ]);
      }

      // If we inline the object as first argument of the parent, we don't want
      // to create another group so that the object breaks before the return
      // type
      const parentParentParent = path.getParentNode(2);
      if (
        (n.type === "ObjectPattern" &&
          parent &&
          shouldHugArguments(parent) &&
          !n.decorators &&
          parent.params[0] === n) ||
        (shouldHugType(n) &&
          parentParentParent &&
          shouldHugArguments(parentParentParent) &&
          parentParentParent.params[0].typeAnnotation &&
          parentParentParent.params[0].typeAnnotation.typeAnnotation === n)
      ) {
        return content;
      }

      return group(content, { shouldBreak });
    }
    // Babel 6
    case "ObjectProperty": // Non-standard AST node type.
    case "Property":
      if (n.method || n.kind === "get" || n.kind === "set") {
        return printMethod(path, options, print);
      }

      if (n.shorthand) {
        parts.push(path.call(print, "value"));
      } else {
        parts.push(
          printAssignment(
            n.key,
            printPropertyKey(path, options, print),
            ":",
            n.value,
            path.call(print, "value"),
            options
          )
        );
      }

      return concat(parts); // Babel 6
    case "ClassMethod":
    case "ClassPrivateMethod":
    case "MethodDefinition":
    case "TSAbstractMethodDefinition":
      if (n.decorators && n.decorators.length !== 0) {
        parts.push(printDecorators(path, options, print));
      }
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.type === "TSAbstractMethodDefinition") {
        parts.push("abstract ");
      }

      parts.push(printMethod(path, options, print));

      return concat(parts);
    case "ObjectMethod":
      return printMethod(path, options, print);
    case "Decorator":
      return concat([
        "@",
        path.call(print, "expression"),
        path.call(print, "callee")
      ]);
    case "ArrayExpression":
    case "ArrayPattern":
      if (n.elements.length === 0) {
        if (!hasDanglingComments(n)) {
          parts.push("[]");
        } else {
          parts.push(
            group(
              concat([
                "[",
                comments.printDanglingComments(path, options),
                softline,
                "]"
              ])
            )
          );
        }
      } else {
        const lastElem = getLast(n.elements);
        const canHaveTrailingComma = !(
          lastElem && lastElem.type === "RestElement"
        );

        // JavaScript allows you to have empty elements in an array which
        // changes its length based on the number of commas. The algorithm
        // is that if the last argument is null, we need to force insert
        // a comma to ensure JavaScript recognizes it.
        //   [,].length === 1
        //   [1,].length === 1
        //   [1,,].length === 2
        //
        // Note that getLast returns null if the array is empty, but
        // we already check for an empty array just above so we are safe
        const needsForcedTrailingComma =
          canHaveTrailingComma && lastElem === null;

        const shouldBreak =
          n.elements.length > 1 &&
          n.elements.every((element, i, elements) => {
            const elementType = element && element.type;
            if (
              elementType !== "ArrayExpression" &&
              elementType !== "ObjectExpression"
            ) {
              return false;
            }

            const nextElement = elements[i + 1];
            if (nextElement && elementType !== nextElement.type) {
              return false;
            }

            const itemsKey =
              elementType === "ArrayExpression" ? "elements" : "properties";

            return element[itemsKey] && element[itemsKey].length > 1;
          });

        parts.push(
          group(
            concat([
              "[",
              indent(
                concat([
                  softline,
                  printArrayItems(path, options, "elements", print)
                ])
              ),
              needsForcedTrailingComma ? "," : "",
              ifBreak(
                canHaveTrailingComma &&
                  !needsForcedTrailingComma &&
                  shouldPrintComma(options)
                  ? ","
                  : ""
              ),
              comments.printDanglingComments(
                path,
                options,
                /* sameIndent */ true
              ),
              softline,
              "]"
            ]),
            { shouldBreak }
          )
        );
      }

      parts.push(
        printOptionalToken(path),
        printTypeAnnotation(path, options, print)
      );

      return concat(parts);
    case "SequenceExpression": {
      const parent = path.getParentNode(0);
      if (
        parent.type === "ExpressionStatement" ||
        parent.type === "ForStatement"
      ) {
        // For ExpressionStatements and for-loop heads, which are among
        // the few places a SequenceExpression appears unparenthesized, we want
        // to indent expressions after the first.
        const parts = [];
        path.each(p => {
          if (p.getName() === 0) {
            parts.push(print(p));
          } else {
            parts.push(",", indent(concat([line, print(p)])));
          }
        }, "expressions");
        return group(concat(parts));
      }
      return group(
        concat([join(concat([",", line]), path.map(print, "expressions"))])
      );
    }
    case "ThisExpression":
      return "this";
    case "Super":
      return "super";
    case "NullLiteral": // Babel 6 Literal split
      return "null";
    case "RegExpLiteral": // Babel 6 Literal split
      return printRegex(n);
    case "NumericLiteral": // Babel 6 Literal split
      return printNumber(n.extra.raw);
    case "BigIntLiteral":
      // babel: n.extra.raw, typescript: n.raw, flow: n.bigint
      return (n.bigint || (n.extra ? n.extra.raw : n.raw)).toLowerCase();
    case "BooleanLiteral": // Babel 6 Literal split
    case "StringLiteral": // Babel 6 Literal split
    case "Literal": {
      if (n.regex) {
        return printRegex(n.regex);
      }
      if (typeof n.value === "number") {
        return printNumber(n.raw);
      }
      if (typeof n.value !== "string") {
        return "" + n.value;
      }
      // TypeScript workaround for https://github.com/JamesHenry/typescript-estree/issues/2
      // See corresponding workaround in needs-parens.js
      const grandParent = path.getParentNode(1);
      const isTypeScriptDirective =
        options.parser === "typescript" &&
        typeof n.value === "string" &&
        grandParent &&
        (grandParent.type === "Program" ||
          grandParent.type === "BlockStatement");

      return nodeStr(n, options, isTypeScriptDirective);
    }
    case "Directive":
      return path.call(print, "value"); // Babel 6
    case "DirectiveLiteral":
      return nodeStr(n, options);
    case "UnaryExpression":
      parts.push(n.operator);

      if (/[a-z]$/.test(n.operator)) {
        parts.push(" ");
      }

      if (n.argument.comments && n.argument.comments.length > 0) {
        parts.push(
          group(
            concat([
              "(",
              indent(concat([softline, path.call(print, "argument")])),
              softline,
              ")"
            ])
          )
        );
      } else {
        parts.push(path.call(print, "argument"));
      }

      return concat(parts);
    case "UpdateExpression":
      parts.push(path.call(print, "argument"), n.operator);

      if (n.prefix) {
        parts.reverse();
      }

      return concat(parts);
    case "ConditionalExpression":
      return printTernaryOperator(path, options, print, {
        beforeParts: () => [path.call(print, "test")],
        afterParts: breakClosingParen => [breakClosingParen ? softline : ""],
        shouldCheckJsx: true,
        conditionalNodeType: "ConditionalExpression",
        consequentNodePropertyName: "consequent",
        alternateNodePropertyName: "alternate",
        testNodePropertyName: "test",
        breakNested: true
      });
    case "VariableDeclaration": {
      const printed = path.map(childPath => {
        return print(childPath);
      }, "declarations");

      // We generally want to terminate all variable declarations with a
      // semicolon, except when they in the () part of for loops.
      const parentNode = path.getParentNode();

      const isParentForLoop =
        parentNode.type === "ForStatement" ||
        parentNode.type === "ForInStatement" ||
        parentNode.type === "ForOfStatement" ||
        parentNode.type === "ForAwaitStatement";

      const hasValue = n.declarations.some(decl => decl.init);

      let firstVariable;
      if (printed.length === 1 && !n.declarations[0].comments) {
        firstVariable = printed[0];
      } else if (printed.length > 0) {
        // Indent first var to comply with eslint one-var rule
        firstVariable = indent(printed[0]);
      }

      parts = [
        n.declare ? "declare " : "",
        n.kind,
        firstVariable ? concat([" ", firstVariable]) : "",
        indent(
          concat(
            printed
              .slice(1)
              .map(p =>
                concat([",", hasValue && !isParentForLoop ? hardline : line, p])
              )
          )
        )
      ];

      if (!(isParentForLoop && parentNode.body !== n)) {
        parts.push(semi);
      }

      return group(concat(parts));
    }
    case "TSTypeAliasDeclaration": {
      if (n.declare) {
        parts.push("declare ");
      }

      const printed = printAssignmentRight(
        n.id,
        n.typeAnnotation,
        n.typeAnnotation && path.call(print, "typeAnnotation"),
        options
      );

      parts.push(
        "type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " =",
        printed,
        semi
      );

      return group(concat(parts));
    }
    case "VariableDeclarator":
      return printAssignment(
        n.id,
        path.call(print, "id"),
        " =",
        n.init,
        n.init && path.call(print, "init"),
        options
      );
    case "WithStatement":
      return group(
        concat([
          "with (",
          path.call(print, "object"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    case "IfStatement": {
      const con = adjustClause(n.consequent, path.call(print, "consequent"));
      const opening = group(
        concat([
          "if (",
          group(
            concat([
              indent(concat([softline, path.call(print, "test")])),
              softline
            ])
          ),
          ")",
          con
        ])
      );

      parts.push(opening);

      if (n.alternate) {
        const commentOnOwnLine =
          (hasTrailingComment(n.consequent) &&
            n.consequent.comments.some(
              comment =>
                comment.trailing && !handleComments.isBlockComment(comment)
            )) ||
          needsHardlineAfterDanglingComment(n);
        const elseOnSameLine =
          n.consequent.type === "BlockStatement" && !commentOnOwnLine;
        parts.push(elseOnSameLine ? " " : hardline);

        if (hasDanglingComments(n)) {
          parts.push(
            comments.printDanglingComments(path, options, true),
            commentOnOwnLine ? hardline : " "
          );
        }

        parts.push(
          "else",
          group(
            adjustClause(
              n.alternate,
              path.call(print, "alternate"),
              n.alternate.type === "IfStatement"
            )
          )
        );
      }

      return concat(parts);
    }
    case "ForStatement": {
      const body = adjustClause(n.body, path.call(print, "body"));

      // We want to keep dangling comments above the loop to stay consistent.
      // Any comment positioned between the for statement and the parentheses
      // is going to be printed before the statement.
      const dangling = comments.printDanglingComments(
        path,
        options,
        /* sameLine */ true
      );
      const printedComments = dangling ? concat([dangling, softline]) : "";

      if (!n.init && !n.test && !n.update) {
        return concat([printedComments, group(concat(["for (;;)", body]))]);
      }

      return concat([
        printedComments,
        group(
          concat([
            "for (",
            group(
              concat([
                indent(
                  concat([
                    softline,
                    path.call(print, "init"),
                    ";",
                    line,
                    path.call(print, "test"),
                    ";",
                    line,
                    path.call(print, "update")
                  ])
                ),
                softline
              ])
            ),
            ")",
            body
          ])
        )
      ]);
    }
    case "WhileStatement":
      return group(
        concat([
          "while (",
          group(
            concat([
              indent(concat([softline, path.call(print, "test")])),
              softline
            ])
          ),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    case "ForInStatement":
      // Note: esprima can't actually parse "for each (".
      return group(
        concat([
          n.each ? "for each (" : "for (",
          path.call(print, "left"),
          " in ",
          path.call(print, "right"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );

    case "ForOfStatement":
    case "ForAwaitStatement": {
      // Babel 7 removed ForAwaitStatement in favor of ForOfStatement
      // with `"await": true`:
      // https://github.com/estree/estree/pull/138
      const isAwait = n.type === "ForAwaitStatement" || n.await;

      return group(
        concat([
          "for",
          isAwait ? " await" : "",
          " (",
          path.call(print, "left"),
          " of ",
          path.call(print, "right"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    }

    case "DoWhileStatement": {
      const clause = adjustClause(n.body, path.call(print, "body"));
      const doBody = group(concat(["do", clause]));
      parts = [doBody];

      if (n.body.type === "BlockStatement") {
        parts.push(" ");
      } else {
        parts.push(hardline);
      }
      parts.push("while (");

      parts.push(
        group(
          concat([
            indent(concat([softline, path.call(print, "test")])),
            softline
          ])
        ),
        ")",
        semi
      );

      return concat(parts);
    }
    case "DoExpression":
      return concat(["do ", path.call(print, "body")]);
    case "BreakStatement":
      parts.push("break");

      if (n.label) {
        parts.push(" ", path.call(print, "label"));
      }

      parts.push(semi);

      return concat(parts);
    case "ContinueStatement":
      parts.push("continue");

      if (n.label) {
        parts.push(" ", path.call(print, "label"));
      }

      parts.push(semi);

      return concat(parts);
    case "LabeledStatement":
      if (n.body.type === "EmptyStatement") {
        return concat([path.call(print, "label"), ":;"]);
      }

      return concat([
        path.call(print, "label"),
        ": ",
        path.call(print, "body")
      ]);
    case "TryStatement":
      return concat([
        "try ",
        path.call(print, "block"),
        n.handler ? concat([" ", path.call(print, "handler")]) : "",
        n.finalizer ? concat([" finally ", path.call(print, "finalizer")]) : ""
      ]);
    case "CatchClause":
      if (n.param) {
        const hasComments =
          n.param.comments &&
          n.param.comments.some(
            comment =>
              !handleComments.isBlockComment(comment) ||
              (comment.leading &&
                hasNewline(options.originalText, options.locEnd(comment))) ||
              (comment.trailing &&
                hasNewline(options.originalText, options.locStart(comment), {
                  backwards: true
                }))
          );
        const param = path.call(print, "param");

        return concat([
          "catch ",
          hasComments
            ? concat(["(", indent(concat([softline, param])), softline, ") "])
            : concat(["(", param, ") "]),
          path.call(print, "body")
        ]);
      }

      return concat(["catch ", path.call(print, "body")]);
    case "ThrowStatement":
      return concat(["throw ", path.call(print, "argument"), semi]);
    // Note: ignoring n.lexical because it has no printing consequences.
    case "SwitchStatement":
      return concat([
        group(
          concat([
            "switch (",
            indent(concat([softline, path.call(print, "discriminant")])),
            softline,
            ")"
          ])
        ),
        " {",
        n.cases.length > 0
          ? indent(
              concat([
                hardline,
                join(
                  hardline,
                  path.map(casePath => {
                    const caseNode = casePath.getValue();
                    return concat([
                      casePath.call(print),
                      n.cases.indexOf(caseNode) !== n.cases.length - 1 &&
                      isNextLineEmpty(options.originalText, caseNode, options)
                        ? hardline
                        : ""
                    ]);
                  }, "cases")
                )
              ])
            )
          : "",
        hardline,
        "}"
      ]);
    case "SwitchCase": {
      if (n.test) {
        parts.push("case ", path.call(print, "test"), ":");
      } else {
        parts.push("default:");
      }

      const consequent = n.consequent.filter(
        node => node.type !== "EmptyStatement"
      );

      if (consequent.length > 0) {
        const cons = path.call(consequentPath => {
          return printStatementSequence(consequentPath, options, print);
        }, "consequent");

        parts.push(
          consequent.length === 1 && consequent[0].type === "BlockStatement"
            ? concat([" ", cons])
            : indent(concat([hardline, cons]))
        );
      }

      return concat(parts);
    }
    // JSX extensions below.
    case "DebuggerStatement":
      return concat(["debugger", semi]);
    case "JSXAttribute":
      parts.push(path.call(print, "name"));

      if (n.value) {
        let res;
        if (isStringLiteral(n.value)) {
          const raw = rawText(n.value);
          // Unescape all quotes so we get an accurate preferred quote
          let final = raw.replace(/&apos;/g, "'").replace(/&quot;/g, '"');
          const quote = getPreferredQuote(
            final,
            options.jsxSingleQuote ? "'" : '"'
          );
          const escape = quote === "'" ? "&apos;" : "&quot;";
          final = final.slice(1, -1).replace(new RegExp(quote, "g"), escape);
          res = concat([quote, final, quote]);
        } else {
          res = path.call(print, "value");
        }
        parts.push("=", res);
      }

      return concat(parts);
    case "JSXIdentifier":
      return "" + n.name;
    case "JSXNamespacedName":
      return join(":", [
        path.call(print, "namespace"),
        path.call(print, "name")
      ]);
    case "JSXMemberExpression":
      return join(".", [
        path.call(print, "object"),
        path.call(print, "property")
      ]);
    case "TSQualifiedName":
      return join(".", [path.call(print, "left"), path.call(print, "right")]);
    case "JSXSpreadAttribute":
    case "JSXSpreadChild": {
      return concat([
        "{",
        path.call(
          p => {
            const printed = concat(["...", print(p)]);
            const n = p.getValue();
            if (!n.comments || !n.comments.length) {
              return printed;
            }
            return concat([
              indent(
                concat([
                  softline,
                  comments.printComments(p, () => printed, options)
                ])
              ),
              softline
            ]);
          },
          n.type === "JSXSpreadAttribute" ? "argument" : "expression"
        ),
        "}"
      ]);
    }
    case "JSXExpressionContainer": {
      const parent = path.getParentNode(0);

      const preventInline =
        parent.type === "JSXAttribute" &&
        n.expression.comments &&
        n.expression.comments.length > 0;

      const shouldInline =
        !preventInline &&
        (n.expression.type === "ArrayExpression" ||
          n.expression.type === "ObjectExpression" ||
          n.expression.type === "ArrowFunctionExpression" ||
          n.expression.type === "CallExpression" ||
          n.expression.type === "OptionalCallExpression" ||
          n.expression.type === "FunctionExpression" ||
          n.expression.type === "JSXEmptyExpression" ||
          n.expression.type === "TemplateLiteral" ||
          n.expression.type === "TaggedTemplateExpression" ||
          n.expression.type === "DoExpression" ||
          (isJSXNode(parent) &&
            (n.expression.type === "ConditionalExpression" ||
              isBinaryish(n.expression))));

      if (shouldInline) {
        return group(
          concat(["{", path.call(print, "expression"), lineSuffixBoundary, "}"])
        );
      }

      return group(
        concat([
          "{",
          indent(concat([softline, path.call(print, "expression")])),
          softline,
          lineSuffixBoundary,
          "}"
        ])
      );
    }
    case "JSXFragment":
    case "JSXElement": {
      const elem = comments.printComments(
        path,
        () => printJSXElement(path, options, print),
        options
      );
      return maybeWrapJSXElementInParens(path, elem, options);
    }
    case "JSXOpeningElement": {
      const n = path.getValue();

      const nameHasComments =
        (n.name && n.name.comments && n.name.comments.length > 0) ||
        (n.typeParameters &&
          n.typeParameters.comments &&
          n.typeParameters.comments.length > 0);

      // Don't break self-closing elements with no attributes and no comments
      if (n.selfClosing && !n.attributes.length && !nameHasComments) {
        return concat([
          "<",
          path.call(print, "name"),
          path.call(print, "typeParameters"),
          " />"
        ]);
      }

      // don't break up opening elements with a single long text attribute
      if (
        n.attributes &&
        n.attributes.length === 1 &&
        n.attributes[0].value &&
        isStringLiteral(n.attributes[0].value) &&
        !n.attributes[0].value.value.includes("\n") &&
        // We should break for the following cases:
        // <div
        //   // comment
        //   attr="value"
        // >
        // <div
        //   attr="value"
        //   // comment
        // >
        !nameHasComments &&
        (!n.attributes[0].comments || !n.attributes[0].comments.length)
      ) {
        return group(
          concat([
            "<",
            path.call(print, "name"),
            path.call(print, "typeParameters"),
            " ",
            concat(path.map(print, "attributes")),
            n.selfClosing ? " />" : ">"
          ])
        );
      }

      const lastAttrHasTrailingComments =
        n.attributes.length && hasTrailingComment(getLast(n.attributes));

      const bracketSameLine =
        // Simple tags (no attributes and no comment in tag name) should be
        // kept unbroken regardless of `jsxBracketSameLine`
        (!n.attributes.length && !nameHasComments) ||
        (options.jsxBracketSameLine &&
          // We should print the bracket in a new line for the following cases:
          // <div
          //   // comment
          // >
          // <div
          //   attr // comment
          // >
          (!nameHasComments || n.attributes.length) &&
          !lastAttrHasTrailingComments);

      // We should print the opening element expanded if any prop value is a
      // string literal with newlines
      const shouldBreak =
        n.attributes &&
        n.attributes.some(
          attr =>
            attr.value &&
            isStringLiteral(attr.value) &&
            attr.value.value.includes("\n")
        );

      return group(
        concat([
          "<",
          path.call(print, "name"),
          path.call(print, "typeParameters"),
          concat([
            indent(
              concat(
                path.map(attr => concat([line, print(attr)]), "attributes")
              )
            ),
            n.selfClosing ? line : bracketSameLine ? ">" : softline
          ]),
          n.selfClosing ? "/>" : bracketSameLine ? "" : ">"
        ]),
        { shouldBreak }
      );
    }
    case "JSXClosingElement":
      return concat(["</", path.call(print, "name"), ">"]);
    case "JSXOpeningFragment":
    case "JSXClosingFragment": {
      const hasComment = n.comments && n.comments.length;
      const hasOwnLineComment =
        hasComment && !n.comments.every(handleComments.isBlockComment);
      const isOpeningFragment = n.type === "JSXOpeningFragment";
      return concat([
        isOpeningFragment ? "<" : "</",
        indent(
          concat([
            hasOwnLineComment
              ? hardline
              : hasComment && !isOpeningFragment
              ? " "
              : "",
            comments.printDanglingComments(path, options, true)
          ])
        ),
        hasOwnLineComment ? hardline : "",
        ">"
      ]);
    }
    case "JSXText":
      /* istanbul ignore next */
      throw new Error("JSXTest should be handled by JSXElement");
    case "JSXEmptyExpression": {
      const requiresHardline =
        n.comments && !n.comments.every(handleComments.isBlockComment);

      return concat([
        comments.printDanglingComments(
          path,
          options,
          /* sameIndent */ !requiresHardline
        ),
        requiresHardline ? hardline : ""
      ]);
    }
    case "ClassBody":
      if (!n.comments && n.body.length === 0) {
        return "{}";
      }

      return concat([
        "{",
        n.body.length > 0
          ? indent(
              concat([
                hardline,
                path.call(bodyPath => {
                  return printStatementSequence(bodyPath, options, print);
                }, "body")
              ])
            )
          : comments.printDanglingComments(path, options),
        hardline,
        "}"
      ]);
    case "ClassProperty":
    case "TSAbstractClassProperty":
    case "ClassPrivateProperty": {
      if (n.decorators && n.decorators.length !== 0) {
        parts.push(printDecorators(path, options, print));
      }
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.declare) {
        parts.push("declare ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.type === "TSAbstractClassProperty") {
        parts.push("abstract ");
      }
      if (n.readonly) {
        parts.push("readonly ");
      }
      const variance = getFlowVariance(n);
      if (variance) {
        parts.push(variance);
      }
      parts.push(
        printPropertyKey(path, options, print),
        printOptionalToken(path),
        printTypeAnnotation(path, options, print)
      );
      if (n.value) {
        parts.push(
          " =",
          printAssignmentRight(
            n.key,
            n.value,
            path.call(print, "value"),
            options
          )
        );
      }

      parts.push(semi);

      return group(concat(parts));
    }
    case "ClassDeclaration":
    case "ClassExpression":
      if (n.declare) {
        parts.push("declare ");
      }
      parts.push(concat(printClass(path, options, print)));
      return concat(parts);
    case "TSInterfaceHeritage":
      parts.push(path.call(print, "expression"));

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      return concat(parts);
    case "TemplateElement":
      return join(literalline, n.value.raw.split(/\r?\n/g));
    case "TemplateLiteral": {
      let expressions = path.map(print, "expressions");
      const parentNode = path.getParentNode();

      if (isJestEachTemplateLiteral(n, parentNode)) {
        const printed = printJestEachTemplateLiteral(n, expressions, options);
        if (printed) {
          return printed;
        }
      }

      const isSimple = isSimpleTemplateLiteral(n);
      if (isSimple) {
        expressions = expressions.map(
          doc =>
            printDocToString(
              doc,
              Object.assign({}, options, {
                printWidth: Infinity
              })
            ).formatted
        );
      }

      parts.push(lineSuffixBoundary, "`");

      path.each(childPath => {
        const i = childPath.getName();

        parts.push(print(childPath));

        if (i < expressions.length) {
          // For a template literal of the following form:
          //   `someQuery {
          //     ${call({
          //       a,
          //       b,
          //     })}
          //   }`
          // the expression is on its own line (there is a \n in the previous
          // quasi literal), therefore we want to indent the JavaScript
          // expression inside at the beginning of ${ instead of the beginning
          // of the `.
          const tabWidth = options.tabWidth;
          const quasi = childPath.getValue();
          const indentSize = getIndentSize(quasi.value.raw, tabWidth);

          let printed = expressions[i];

          if (!isSimple) {
            // Breaks at the template element boundaries (${ and }) are preferred to breaking
            // in the middle of a MemberExpression
            if (
              (n.expressions[i].comments && n.expressions[i].comments.length) ||
              n.expressions[i].type === "MemberExpression" ||
              n.expressions[i].type === "OptionalMemberExpression" ||
              n.expressions[i].type === "ConditionalExpression"
            ) {
              printed = concat([indent(concat([softline, printed])), softline]);
            }
          }

          const aligned =
            indentSize === 0 && quasi.value.raw.endsWith("\n")
              ? align(-Infinity, printed)
              : addAlignmentToDoc(printed, indentSize, tabWidth);

          parts.push(group(concat(["${", aligned, lineSuffixBoundary, "}"])));
        }
      }, "quasis");

      parts.push("`");

      return concat(parts);
    }
    // These types are unprintable because they serve as abstract
    // supertypes for other (printable) types.
    case "TaggedTemplateExpression":
      return concat([
        path.call(print, "tag"),
        path.call(print, "typeParameters"),
        path.call(print, "quasi")
      ]);
    case "Node":
    case "Printable":
    case "SourceLocation":
    case "Position":
    case "Statement":
    case "Function":
    case "Pattern":
    case "Expression":
    case "Declaration":
    case "Specifier":
    case "NamedSpecifier":
    case "Comment":
    case "MemberTypeAnnotation": // Flow
    case "Type":
      /* istanbul ignore next */
      throw new Error("unprintable type: " + JSON.stringify(n.type));
    // Type Annotations for Facebook Flow, typically stripped out or
    // transformed away before printing.
    case "TypeAnnotation":
    case "TSTypeAnnotation":
      if (n.typeAnnotation) {
        return path.call(print, "typeAnnotation");
      }

      /* istanbul ignore next */
      return "";
    case "TSTupleType":
    case "TupleTypeAnnotation": {
      const typesField = n.type === "TSTupleType" ? "elementTypes" : "types";
      return group(
        concat([
          "[",
          indent(
            concat([
              softline,
              printArrayItems(path, options, typesField, print)
            ])
          ),
          ifBreak(shouldPrintComma(options, "all") ? "," : ""),
          comments.printDanglingComments(path, options, /* sameIndent */ true),
          softline,
          "]"
        ])
      );
    }

    case "ExistsTypeAnnotation":
      return "*";
    case "EmptyTypeAnnotation":
      return "empty";
    case "AnyTypeAnnotation":
      return "any";
    case "MixedTypeAnnotation":
      return "mixed";
    case "ArrayTypeAnnotation":
      return concat([path.call(print, "elementType"), "[]"]);
    case "BooleanTypeAnnotation":
      return "boolean";
    case "BooleanLiteralTypeAnnotation":
      return "" + n.value;
    case "DeclareClass":
      return printFlowDeclaration(path, printClass(path, options, print));
    case "TSDeclareFunction":
      // For TypeScript the TSDeclareFunction node shares the AST
      // structure with FunctionDeclaration
      return concat([
        n.declare ? "declare " : "",
        printFunctionDeclaration(path, print, options),
        semi
      ]);
    case "DeclareFunction":
      return printFlowDeclaration(path, [
        "function ",
        path.call(print, "id"),
        n.predicate ? " " : "",
        path.call(print, "predicate"),
        semi
      ]);
    case "DeclareModule":
      return printFlowDeclaration(path, [
        "module ",
        path.call(print, "id"),
        " ",
        path.call(print, "body")
      ]);
    case "DeclareModuleExports":
      return printFlowDeclaration(path, [
        "module.exports",
        ": ",
        path.call(print, "typeAnnotation"),
        semi
      ]);
    case "DeclareVariable":
      return printFlowDeclaration(path, ["var ", path.call(print, "id"), semi]);
    case "DeclareExportAllDeclaration":
      return concat(["declare export * from ", path.call(print, "source")]);
    case "DeclareExportDeclaration":
      return concat(["declare ", printExportDeclaration(path, options, print)]);
    case "DeclareOpaqueType":
    case "OpaqueType": {
      parts.push(
        "opaque type ",
        path.call(print, "id"),
        path.call(print, "typeParameters")
      );

      if (n.supertype) {
        parts.push(": ", path.call(print, "supertype"));
      }

      if (n.impltype) {
        parts.push(" = ", path.call(print, "impltype"));
      }

      parts.push(semi);

      if (n.type === "DeclareOpaqueType") {
        return printFlowDeclaration(path, parts);
      }

      return concat(parts);
    }

    case "EnumDeclaration":
      return concat([
        "enum ",
        path.call(print, "id"),
        " ",
        path.call(print, "body")
      ]);
    case "EnumBooleanBody":
    case "EnumNumberBody":
    case "EnumStringBody":
    case "EnumSymbolBody": {
      if (n.type === "EnumSymbolBody" || n.explicitType) {
        let type = null;
        switch (n.type) {
          case "EnumBooleanBody":
            type = "boolean";
            break;
          case "EnumNumberBody":
            type = "number";
            break;
          case "EnumStringBody":
            type = "string";
            break;
          case "EnumSymbolBody":
            type = "symbol";
            break;
        }
        parts.push("of ", type, " ");
      }
      if (n.members.length === 0) {
        parts.push(
          group(
            concat([
              "{",
              comments.printDanglingComments(path, options),
              softline,
              "}"
            ])
          )
        );
      } else {
        parts.push(
          group(
            concat([
              "{",
              indent(
                concat([
                  hardline,
                  printArrayItems(path, options, "members", print),
                  shouldPrintComma(options) ? "," : ""
                ])
              ),
              comments.printDanglingComments(
                path,
                options,
                /* sameIndent */ true
              ),
              hardline,
              "}"
            ])
          )
        );
      }
      return concat(parts);
    }
    case "EnumBooleanMember":
    case "EnumNumberMember":
    case "EnumStringMember":
      return concat([
        path.call(print, "id"),
        " = ",
        typeof n.init === "object" ? path.call(print, "init") : String(n.init)
      ]);
    case "EnumDefaultedMember":
      return path.call(print, "id");

    case "FunctionTypeAnnotation":
    case "TSFunctionType": {
      // FunctionTypeAnnotation is ambiguous:
      // declare function foo(a: B): void; OR
      // var A: (a: B) => void;
      const parent = path.getParentNode(0);
      const parentParent = path.getParentNode(1);
      const parentParentParent = path.getParentNode(2);
      let isArrowFunctionTypeAnnotation =
        n.type === "TSFunctionType" ||
        !(
          ((parent.type === "ObjectTypeProperty" ||
            parent.type === "ObjectTypeInternalSlot") &&
            !getFlowVariance(parent) &&
            !parent.optional &&
            options.locStart(parent) === options.locStart(n)) ||
          parent.type === "ObjectTypeCallProperty" ||
          (parentParentParent && parentParentParent.type === "DeclareFunction")
        );

      let needsColon =
        isArrowFunctionTypeAnnotation &&
        (parent.type === "TypeAnnotation" ||
          parent.type === "TSTypeAnnotation");

      // Sadly we can't put it inside of FastPath::needsColon because we are
      // printing ":" as part of the expression and it would put parenthesis
      // around :(
      const needsParens =
        needsColon &&
        isArrowFunctionTypeAnnotation &&
        (parent.type === "TypeAnnotation" ||
          parent.type === "TSTypeAnnotation") &&
        parentParent.type === "ArrowFunctionExpression";

      if (isObjectTypePropertyAFunction(parent, options)) {
        isArrowFunctionTypeAnnotation = true;
        needsColon = true;
      }

      if (needsParens) {
        parts.push("(");
      }

      parts.push(
        printFunctionParams(
          path,
          print,
          options,
          /* expandArg */ false,
          /* printTypeParams */ true
        )
      );

      // The returnType is not wrapped in a TypeAnnotation, so the colon
      // needs to be added separately.
      if (n.returnType || n.predicate || n.typeAnnotation) {
        parts.push(
          isArrowFunctionTypeAnnotation ? " => " : ": ",
          path.call(print, "returnType"),
          path.call(print, "predicate"),
          path.call(print, "typeAnnotation")
        );
      }
      if (needsParens) {
        parts.push(")");
      }

      return group(concat(parts));
    }
    case "TSRestType":
      return concat(["...", path.call(print, "typeAnnotation")]);
    case "TSOptionalType":
      return concat([path.call(print, "typeAnnotation"), "?"]);
    case "FunctionTypeParam":
      return concat([
        path.call(print, "name"),
        printOptionalToken(path),
        n.name ? ": " : "",
        path.call(print, "typeAnnotation")
      ]);
    case "GenericTypeAnnotation":
      return concat([
        path.call(print, "id"),
        path.call(print, "typeParameters")
      ]);

    case "DeclareInterface":
    case "InterfaceDeclaration":
    case "InterfaceTypeAnnotation": {
      if (n.type === "DeclareInterface" || n.declare) {
        parts.push("declare ");
      }

      parts.push("interface");

      if (n.type === "DeclareInterface" || n.type === "InterfaceDeclaration") {
        parts.push(
          " ",
          path.call(print, "id"),
          path.call(print, "typeParameters")
        );
      }

      if (n["extends"].length > 0) {
        parts.push(
          group(
            indent(
              concat([
                line,
                "extends ",
                (n.extends.length === 1 ? identity : indent)(
                  join(concat([",", line]), path.map(print, "extends"))
                )
              ])
            )
          )
        );
      }

      parts.push(" ", path.call(print, "body"));

      return group(concat(parts));
    }
    case "ClassImplements":
    case "InterfaceExtends":
      return concat([
        path.call(print, "id"),
        path.call(print, "typeParameters")
      ]);
    case "TSClassImplements":
      return concat([
        path.call(print, "expression"),
        path.call(print, "typeParameters")
      ]);
    case "TSIntersectionType":
    case "IntersectionTypeAnnotation": {
      const types = path.map(print, "types");
      const result = [];
      let wasIndented = false;
      for (let i = 0; i < types.length; ++i) {
        if (i === 0) {
          result.push(types[i]);
        } else if (isObjectType(n.types[i - 1]) && isObjectType(n.types[i])) {
          // If both are objects, don't indent
          result.push(
            concat([" & ", wasIndented ? indent(types[i]) : types[i]])
          );
        } else if (!isObjectType(n.types[i - 1]) && !isObjectType(n.types[i])) {
          // If no object is involved, go to the next line if it breaks
          result.push(indent(concat([" &", line, types[i]])));
        } else {
          // If you go from object to non-object or vis-versa, then inline it
          if (i > 1) {
            wasIndented = true;
          }
          result.push(" & ", i > 1 ? indent(types[i]) : types[i]);
        }
      }
      return group(concat(result));
    }
    case "TSUnionType":
    case "UnionTypeAnnotation": {
      // single-line variation
      // A | B | C

      // multi-line variation
      // | A
      // | B
      // | C

      const parent = path.getParentNode();

      // If there's a leading comment, the parent is doing the indentation
      const shouldIndent =
        parent.type !== "TypeParameterInstantiation" &&
        parent.type !== "TSTypeParameterInstantiation" &&
        parent.type !== "GenericTypeAnnotation" &&
        parent.type !== "TSTypeReference" &&
        parent.type !== "TSTypeAssertion" &&
        parent.type !== "TupleTypeAnnotation" &&
        parent.type !== "TSTupleType" &&
        !(parent.type === "FunctionTypeParam" && !parent.name) &&
        !(
          (parent.type === "TypeAlias" ||
            parent.type === "VariableDeclarator" ||
            parent.type === "TSTypeAliasDeclaration") &&
          hasLeadingOwnLineComment(options.originalText, n, options)
        );

      // {
      //   a: string
      // } | null | void
      // should be inlined and not be printed in the multi-line variant
      const shouldHug = shouldHugType(n);

      // We want to align the children but without its comment, so it looks like
      // | child1
      // // comment
      // | child2
      const printed = path.map(typePath => {
        let printedType = typePath.call(print);
        if (!shouldHug) {
          printedType = align(2, printedType);
        }
        return comments.printComments(typePath, () => printedType, options);
      }, "types");

      if (shouldHug) {
        return join(" | ", printed);
      }

      const shouldAddStartLine =
        shouldIndent &&
        !hasLeadingOwnLineComment(options.originalText, n, options);

      const code = concat([
        ifBreak(concat([shouldAddStartLine ? line : "", "| "])),
        join(concat([line, "| "]), printed)
      ]);

      if (pathNeedsParens(path, options)) {
        return group(concat([indent(code), softline]));
      }

      if (
        (parent.type === "TupleTypeAnnotation" && parent.types.length > 1) ||
        (parent.type === "TSTupleType" && parent.elementTypes.length > 1)
      ) {
        return group(
          concat([
            indent(concat([ifBreak(concat(["(", softline])), code])),
            softline,
            ifBreak(")")
          ])
        );
      }

      return group(shouldIndent ? indent(code) : code);
    }
    case "NullableTypeAnnotation":
      return concat(["?", path.call(print, "typeAnnotation")]);
    case "TSNullKeyword":
    case "NullLiteralTypeAnnotation":
      return "null";
    case "ThisTypeAnnotation":
      return "this";
    case "NumberTypeAnnotation":
      return "number";
    case "ObjectTypeCallProperty":
      if (n.static) {
        parts.push("static ");
      }

      parts.push(path.call(print, "value"));

      return concat(parts);
    case "ObjectTypeIndexer": {
      const variance = getFlowVariance(n);
      return concat([
        variance || "",
        "[",
        path.call(print, "id"),
        n.id ? ": " : "",
        path.call(print, "key"),
        "]: ",
        path.call(print, "value")
      ]);
    }
    case "ObjectTypeProperty": {
      const variance = getFlowVariance(n);

      let modifier = "";

      if (n.proto) {
        modifier = "proto ";
      } else if (n.static) {
        modifier = "static ";
      }

      return concat([
        modifier,
        isGetterOrSetter(n) ? n.kind + " " : "",
        variance || "",
        printPropertyKey(path, options, print),
        printOptionalToken(path),
        isFunctionNotation(n, options) ? "" : ": ",
        path.call(print, "value")
      ]);
    }
    case "QualifiedTypeIdentifier":
      return concat([
        path.call(print, "qualification"),
        ".",
        path.call(print, "id")
      ]);
    case "StringLiteralTypeAnnotation":
      return nodeStr(n, options);
    case "NumberLiteralTypeAnnotation":
      assert.strictEqual(typeof n.value, "number");

      if (n.extra != null) {
        return printNumber(n.extra.raw);
      }
      return printNumber(n.raw);

    case "StringTypeAnnotation":
      return "string";
    case "DeclareTypeAlias":
    case "TypeAlias": {
      if (n.type === "DeclareTypeAlias" || n.declare) {
        parts.push("declare ");
      }

      const printed = printAssignmentRight(
        n.id,
        n.right,
        path.call(print, "right"),
        options
      );

      parts.push(
        "type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " =",
        printed,
        semi
      );

      return group(concat(parts));
    }
    case "TypeCastExpression": {
      const value = path.getValue();
      // Flow supports a comment syntax for specifying type annotations: https://flow.org/en/docs/types/comments/.
      // Unfortunately, its parser doesn't differentiate between comment annotations and regular
      // annotations when producing an AST. So to preserve parentheses around type casts that use
      // the comment syntax, we need to hackily read the source itself to see if the code contains
      // a type annotation comment.
      //
      // Note that we're able to use the normal whitespace regex here because the Flow parser has
      // already deemed this AST node to be a type cast. Only the Babel parser needs the
      // non-line-break whitespace regex, which is why hasFlowShorthandAnnotationComment() is
      // implemented differently.
      const commentSyntax =
        value &&
        value.typeAnnotation &&
        value.typeAnnotation.range &&
        options.originalText
          .substring(value.typeAnnotation.range[0])
          .match(/^\/\*\s*:/);
      return concat([
        "(",
        path.call(print, "expression"),
        commentSyntax ? " /*" : "",
        ": ",
        path.call(print, "typeAnnotation"),
        commentSyntax ? " */" : "",
        ")"
      ]);
    }

    case "TypeParameterDeclaration":
    case "TypeParameterInstantiation": {
      const value = path.getValue();
      const commentStart = value.range
        ? options.originalText.substring(0, value.range[0]).lastIndexOf("/*")
        : -1;
      // As noted in the TypeCastExpression comments above, we're able to use a normal whitespace regex here
      // because we know for sure that this is a type definition.
      const commentSyntax =
        commentStart >= 0 &&
        options.originalText.substring(commentStart).match(/^\/\*\s*::/);
      if (commentSyntax) {
        return concat([
          "/*:: ",
          printTypeParameters(path, options, print, "params"),
          " */"
        ]);
      }

      return printTypeParameters(path, options, print, "params");
    }

    case "TSTypeParameterDeclaration":
    case "TSTypeParameterInstantiation":
      return printTypeParameters(path, options, print, "params");

    case "TSTypeParameter":
    case "TypeParameter": {
      const parent = path.getParentNode();
      if (parent.type === "TSMappedType") {
        parts.push("[", path.call(print, "name"));
        if (n.constraint) {
          parts.push(" in ", path.call(print, "constraint"));
        }
        parts.push("]");
        return concat(parts);
      }

      const variance = getFlowVariance(n);

      if (variance) {
        parts.push(variance);
      }

      parts.push(path.call(print, "name"));

      if (n.bound) {
        parts.push(": ");
        parts.push(path.call(print, "bound"));
      }

      if (n.constraint) {
        parts.push(" extends ", path.call(print, "constraint"));
      }

      if (n["default"]) {
        parts.push(" = ", path.call(print, "default"));
      }

      // Keep comma if the file extension is .tsx and
      // has one type parameter that isn't extend with any types.
      // Because, otherwise formatted result will be invalid as tsx.
      const grandParent = path.getNode(2);
      if (
        parent.params &&
        parent.params.length === 1 &&
        isTSXFile(options) &&
        !n.constraint &&
        grandParent.type === "ArrowFunctionExpression"
      ) {
        parts.push(",");
      }

      return concat(parts);
    }
    case "TypeofTypeAnnotation":
      return concat(["typeof ", path.call(print, "argument")]);
    case "VoidTypeAnnotation":
      return "void";
    case "InferredPredicate":
      return "%checks";
    // Unhandled types below. If encountered, nodes of these types should
    // be either left alone or desugared into AST types that are fully
    // supported by the pretty-printer.
    case "DeclaredPredicate":
      return concat(["%checks(", path.call(print, "value"), ")"]);
    case "TSAbstractKeyword":
      return "abstract";
    case "TSAnyKeyword":
      return "any";
    case "TSAsyncKeyword":
      return "async";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSBigIntKeyword":
      return "bigint";
    case "TSConstKeyword":
      return "const";
    case "TSDeclareKeyword":
      return "declare";
    case "TSExportKeyword":
      return "export";
    case "TSNeverKeyword":
      return "never";
    case "TSNumberKeyword":
      return "number";
    case "TSObjectKeyword":
      return "object";
    case "TSProtectedKeyword":
      return "protected";
    case "TSPrivateKeyword":
      return "private";
    case "TSPublicKeyword":
      return "public";
    case "TSReadonlyKeyword":
      return "readonly";
    case "TSSymbolKeyword":
      return "symbol";
    case "TSStaticKeyword":
      return "static";
    case "TSStringKeyword":
      return "string";
    case "TSUndefinedKeyword":
      return "undefined";
    case "TSUnknownKeyword":
      return "unknown";
    case "TSVoidKeyword":
      return "void";
    case "TSAsExpression":
      return concat([
        path.call(print, "expression"),
        " as ",
        path.call(print, "typeAnnotation")
      ]);
    case "TSArrayType":
      return concat([path.call(print, "elementType"), "[]"]);
    case "TSPropertySignature": {
      if (n.export) {
        parts.push("export ");
      }
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.readonly) {
        parts.push("readonly ");
      }

      parts.push(
        printPropertyKey(path, options, print),
        printOptionalToken(path)
      );

      if (n.typeAnnotation) {
        parts.push(": ");
        parts.push(path.call(print, "typeAnnotation"));
      }

      // This isn't valid semantically, but it's in the AST so we can print it.
      if (n.initializer) {
        parts.push(" = ", path.call(print, "initializer"));
      }

      return concat(parts);
    }
    case "TSParameterProperty":
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.export) {
        parts.push("export ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.readonly) {
        parts.push("readonly ");
      }

      parts.push(path.call(print, "parameter"));

      return concat(parts);
    case "TSTypeReference":
      return concat([
        path.call(print, "typeName"),
        printTypeParameters(path, options, print, "typeParameters")
      ]);
    case "TSTypeQuery":
      return concat(["typeof ", path.call(print, "exprName")]);
    case "TSIndexSignature": {
      const parent = path.getParentNode();

      return concat([
        n.export ? "export " : "",
        n.accessibility ? concat([n.accessibility, " "]) : "",
        n.static ? "static " : "",
        n.readonly ? "readonly " : "",
        "[",
        n.parameters ? concat(path.map(print, "parameters")) : "",
        "]: ",
        path.call(print, "typeAnnotation"),
        parent.type === "ClassBody" ? semi : ""
      ]);
    }
    case "TSTypePredicate":
      return concat([
        n.asserts ? "asserts " : "",
        path.call(print, "parameterName"),
        n.typeAnnotation
          ? concat([" is ", path.call(print, "typeAnnotation")])
          : ""
      ]);
    case "TSNonNullExpression":
      return concat([path.call(print, "expression"), "!"]);
    case "TSThisType":
      return "this";
    case "TSImportType":
      return concat([
        !n.isTypeOf ? "" : "typeof ",
        "import(",
        path.call(print, "parameter"),
        ")",
        !n.qualifier ? "" : concat([".", path.call(print, "qualifier")]),
        printTypeParameters(path, options, print, "typeParameters")
      ]);
    case "TSLiteralType":
      return path.call(print, "literal");
    case "TSIndexedAccessType":
      return concat([
        path.call(print, "objectType"),
        "[",
        path.call(print, "indexType"),
        "]"
      ]);
    case "TSConstructSignatureDeclaration":
    case "TSCallSignatureDeclaration":
    case "TSConstructorType": {
      if (n.type !== "TSCallSignatureDeclaration") {
        parts.push("new ");
      }

      parts.push(
        group(
          printFunctionParams(
            path,
            print,
            options,
            /* expandArg */ false,
            /* printTypeParams */ true
          )
        )
      );

      if (n.returnType) {
        const isType = n.type === "TSConstructorType";
        parts.push(isType ? " => " : ": ", path.call(print, "returnType"));
      }
      return concat(parts);
    }
    case "TSTypeOperator":
      return concat([n.operator, " ", path.call(print, "typeAnnotation")]);
    case "TSMappedType": {
      const shouldBreak = hasNewlineInRange(
        options.originalText,
        options.locStart(n),
        options.locEnd(n)
      );
      return group(
        concat([
          "{",
          indent(
            concat([
              options.bracketSpacing ? line : softline,
              n.readonly
                ? concat([
                    getTypeScriptMappedTypeModifier(n.readonly, "readonly"),
                    " "
                  ])
                : "",
              printTypeScriptModifiers(path, options, print),
              path.call(print, "typeParameter"),
              n.optional
                ? getTypeScriptMappedTypeModifier(n.optional, "?")
                : "",
              ": ",
              path.call(print, "typeAnnotation"),
              ifBreak(semi, "")
            ])
          ),
          comments.printDanglingComments(path, options, /* sameIndent */ true),
          options.bracketSpacing ? line : softline,
          "}"
        ]),
        { shouldBreak }
      );
    }
    case "TSMethodSignature":
      parts.push(
        n.accessibility ? concat([n.accessibility, " "]) : "",
        n.export ? "export " : "",
        n.static ? "static " : "",
        n.readonly ? "readonly " : "",
        n.computed ? "[" : "",
        path.call(print, "key"),
        n.computed ? "]" : "",
        printOptionalToken(path),
        printFunctionParams(
          path,
          print,
          options,
          /* expandArg */ false,
          /* printTypeParams */ true
        )
      );

      if (n.returnType) {
        parts.push(": ", path.call(print, "returnType"));
      }
      return group(concat(parts));
    case "TSNamespaceExportDeclaration":
      parts.push("export as namespace ", path.call(print, "id"));

      if (options.semi) {
        parts.push(";");
      }

      return group(concat(parts));
    case "TSEnumDeclaration":
      if (n.declare) {
        parts.push("declare ");
      }

      if (n.modifiers) {
        parts.push(printTypeScriptModifiers(path, options, print));
      }
      if (n.const) {
        parts.push("const ");
      }

      parts.push("enum ", path.call(print, "id"), " ");

      if (n.members.length === 0) {
        parts.push(
          group(
            concat([
              "{",
              comments.printDanglingComments(path, options),
              softline,
              "}"
            ])
          )
        );
      } else {
        parts.push(
          group(
            concat([
              "{",
              indent(
                concat([
                  hardline,
                  printArrayItems(path, options, "members", print),
                  shouldPrintComma(options, "es5") ? "," : ""
                ])
              ),
              comments.printDanglingComments(
                path,
                options,
                /* sameIndent */ true
              ),
              hardline,
              "}"
            ])
          )
        );
      }

      return concat(parts);
    case "TSEnumMember":
      parts.push(path.call(print, "id"));
      if (n.initializer) {
        parts.push(" = ", path.call(print, "initializer"));
      }
      return concat(parts);
    case "TSImportEqualsDeclaration":
      if (n.isExport) {
        parts.push("export ");
      }
      parts.push(
        "import ",
        path.call(print, "id"),
        " = ",
        path.call(print, "moduleReference")
      );

      if (options.semi) {
        parts.push(";");
      }

      return group(concat(parts));
    case "TSExternalModuleReference":
      return concat(["require(", path.call(print, "expression"), ")"]);
    case "TSModuleDeclaration": {
      const parent = path.getParentNode();
      const isExternalModule = isLiteral(n.id);
      const parentIsDeclaration = parent.type === "TSModuleDeclaration";
      const bodyIsDeclaration = n.body && n.body.type === "TSModuleDeclaration";

      if (parentIsDeclaration) {
        parts.push(".");
      } else {
        if (n.declare) {
          parts.push("declare ");
        }
        parts.push(printTypeScriptModifiers(path, options, print));

        const textBetweenNodeAndItsId = options.originalText.slice(
          options.locStart(n),
          options.locStart(n.id)
        );

        // Global declaration looks like this:
        // (declare)? global { ... }
        const isGlobalDeclaration =
          n.id.type === "Identifier" &&
          n.id.name === "global" &&
          !/namespace|module/.test(textBetweenNodeAndItsId);

        if (!isGlobalDeclaration) {
          parts.push(
            isExternalModule ||
              /(^|\s)module(\s|$)/.test(textBetweenNodeAndItsId)
              ? "module "
              : "namespace "
          );
        }
      }

      parts.push(path.call(print, "id"));

      if (bodyIsDeclaration) {
        parts.push(path.call(print, "body"));
      } else if (n.body) {
        parts.push(" ", group(path.call(print, "body")));
      } else {
        parts.push(semi);
      }

      return concat(parts);
    }

    case "PrivateName":
      return concat(["#", path.call(print, "id")]);

    case "TSConditionalType":
      return printTernaryOperator(path, options, print, {
        beforeParts: () => [
          path.call(print, "checkType"),
          " ",
          "extends",
          " ",
          path.call(print, "extendsType")
        ],
        afterParts: () => [],
        shouldCheckJsx: false,
        conditionalNodeType: "TSConditionalType",
        consequentNodePropertyName: "trueType",
        alternateNodePropertyName: "falseType",
        testNodePropertyName: "checkType",
        breakNested: true
      });

    case "TSInferType":
      return concat(["infer", " ", path.call(print, "typeParameter")]);

    case "InterpreterDirective":
      parts.push("#!", n.value, hardline);

      if (isNextLineEmpty(options.originalText, n, options)) {
        parts.push(hardline);
      }

      return concat(parts);

    case "NGRoot":
      return concat(
        [].concat(
          path.call(print, "node"),
          !n.node.comments || n.node.comments.length === 0
            ? []
            : concat([" //", n.node.comments[0].value.trimRight()])
        )
      );
    case "NGChainedExpression":
      return group(
        join(
          concat([";", line]),
          path.map(
            childPath =>
              hasNgSideEffect(childPath)
                ? print(childPath)
                : concat(["(", print(childPath), ")"]),
            "expressions"
          )
        )
      );
    case "NGEmptyExpression":
      return "";
    case "NGQuotedExpression":
      return concat([n.prefix, ":", n.value]);
    case "NGMicrosyntax":
      return concat(
        path.map(
          (childPath, index) =>
            concat([
              index === 0
                ? ""
                : isNgForOf(childPath.getValue(), index, n)
                ? " "
                : concat([";", line]),
              print(childPath)
            ]),
          "body"
        )
      );
    case "NGMicrosyntaxKey":
      return /^[a-z_$][a-z0-9_$]*(-[a-z_$][a-z0-9_$])*$/i.test(n.name)
        ? n.name
        : JSON.stringify(n.name);
    case "NGMicrosyntaxExpression":
      return concat([
        path.call(print, "expression"),
        n.alias === null ? "" : concat([" as ", path.call(print, "alias")])
      ]);
    case "NGMicrosyntaxKeyedExpression": {
      const index = path.getName();
      const parentNode = path.getParentNode();
      const shouldNotPrintColon =
        isNgForOf(n, index, parentNode) ||
        (((index === 1 && (n.key.name === "then" || n.key.name === "else")) ||
          (index === 2 &&
            n.key.name === "else" &&
            parentNode.body[index - 1].type ===
              "NGMicrosyntaxKeyedExpression" &&
            parentNode.body[index - 1].key.name === "then")) &&
          parentNode.body[0].type === "NGMicrosyntaxExpression");
      return concat([
        path.call(print, "key"),
        shouldNotPrintColon ? " " : ": ",
        path.call(print, "expression")
      ]);
    }
    case "NGMicrosyntaxLet":
      return concat([
        "let ",
        path.call(print, "key"),
        n.value === null ? "" : concat([" = ", path.call(print, "value")])
      ]);
    case "NGMicrosyntaxAs":
      return concat([
        path.call(print, "key"),
        " as ",
        path.call(print, "alias")
      ]);

    case "ArgumentPlaceholder":
      return "?";
    default:
      /* istanbul ignore next */
      throw new Error("unknown type: " + JSON.stringify(n.type));
  }
}

function printStatementSequence(path, options, print) {
  const printed = [];

  const bodyNode = path.getNode();
  const isClass = bodyNode.type === "ClassBody";

  path.map((stmtPath, i) => {
    const stmt = stmtPath.getValue();

    // Just in case the AST has been modified to contain falsy
    // "statements," it's safer simply to skip them.
    /* istanbul ignore if */
    if (!stmt) {
      return;
    }

    // Skip printing EmptyStatement nodes to avoid leaving stray
    // semicolons lying around.
    if (stmt.type === "EmptyStatement") {
      return;
    }

    const stmtPrinted = print(stmtPath);
    const text = options.originalText;
    const parts = [];

    // in no-semi mode, prepend statement with semicolon if it might break ASI
    // don't prepend the only JSX element in a program with semicolon
    if (
      !options.semi &&
      !isClass &&
      !isTheOnlyJSXElementInMarkdown(options, stmtPath) &&
      stmtNeedsASIProtection(stmtPath, options)
    ) {
      if (stmt.comments && stmt.comments.some(comment => comment.leading)) {
        parts.push(print(stmtPath, { needsSemi: true }));
      } else {
        parts.push(";", stmtPrinted);
      }
    } else {
      parts.push(stmtPrinted);
    }

    if (!options.semi && isClass) {
      if (classPropMayCauseASIProblems(stmtPath)) {
        parts.push(";");
      } else if (stmt.type === "ClassProperty") {
        const nextChild = bodyNode.body[i + 1];
        if (classChildNeedsASIProtection(nextChild)) {
          parts.push(";");
        }
      }
    }

    if (isNextLineEmpty(text, stmt, options) && !isLastStatement(stmtPath)) {
      parts.push(hardline);
    }

    printed.push(concat(parts));
  });

  return join(hardline, printed);
}

function printPropertyKey(path, options, print) {
  const node = path.getNode();

  if (node.computed) {
    return concat(["[", path.call(print, "key"), "]"]);
  }

  const parent = path.getParentNode();
  const key = node.key;

  if (options.quoteProps === "consistent" && !needsQuoteProps.has(parent)) {
    const objectHasStringProp = (
      parent.properties ||
      parent.body ||
      parent.members
    ).some(
      prop =>
        !prop.computed &&
        prop.key &&
        isStringLiteral(prop.key) &&
        !isStringPropSafeToCoerceToIdentifier(prop, options)
    );
    needsQuoteProps.set(parent, objectHasStringProp);
  }

  if (
    key.type === "Identifier" &&
    (options.parser === "json" ||
      (options.quoteProps === "consistent" && needsQuoteProps.get(parent)))
  ) {
    // a -> "a"
    const prop = printString(JSON.stringify(key.name), options);
    return path.call(
      keyPath => comments.printComments(keyPath, () => prop, options),
      "key"
    );
  }

  if (
    isStringPropSafeToCoerceToIdentifier(node, options) &&
    (options.quoteProps === "as-needed" ||
      (options.quoteProps === "consistent" && !needsQuoteProps.get(parent)))
  ) {
    // 'a' -> a
    return path.call(
      keyPath => comments.printComments(keyPath, () => key.value, options),
      "key"
    );
  }

  return path.call(print, "key");
}

function printMethod(path, options, print) {
  const node = path.getNode();
  const kind = node.kind;
  const value = node.value || node;
  const parts = [];

  if (!kind || kind === "init" || kind === "method" || kind === "constructor") {
    if (value.async) {
      parts.push("async ");
    }
    if (value.generator) {
      parts.push("*");
    }
  } else {
    assert.ok(kind === "get" || kind === "set");

    parts.push(kind, " ");
  }

  parts.push(
    printPropertyKey(path, options, print),
    node.optional || node.key.optional ? "?" : "",
    node === value
      ? printMethodInternal(path, options, print)
      : path.call(path => printMethodInternal(path, options, print), "value")
  );

  return concat(parts);
}

function printMethodInternal(path, options, print) {
  const parts = [
    printFunctionTypeParameters(path, options, print),
    group(
      concat([
        printFunctionParams(path, print, options),
        printReturnType(path, print, options)
      ])
    )
  ];

  if (path.getNode().body) {
    parts.push(" ", path.call(print, "body"));
  } else {
    parts.push(options.semi ? ";" : "");
  }

  return concat(parts);
}

function couldGroupArg(arg) {
  return (
    (arg.type === "ObjectExpression" &&
      (arg.properties.length > 0 || arg.comments)) ||
    (arg.type === "ArrayExpression" &&
      (arg.elements.length > 0 || arg.comments)) ||
    (arg.type === "TSTypeAssertion" && couldGroupArg(arg.expression)) ||
    (arg.type === "TSAsExpression" && couldGroupArg(arg.expression)) ||
    arg.type === "FunctionExpression" ||
    (arg.type === "ArrowFunctionExpression" &&
      // we want to avoid breaking inside composite return types but not simple keywords
      // https://github.com/prettier/prettier/issues/4070
      // export class Thing implements OtherThing {
      //   do: (type: Type) => Provider<Prop> = memoize(
      //     (type: ObjectType): Provider<Opts> => {}
      //   );
      // }
      // https://github.com/prettier/prettier/issues/6099
      // app.get("/", (req, res): void => {
      //   res.send("Hello World!");
      // });
      (!arg.returnType ||
        !arg.returnType.typeAnnotation ||
        arg.returnType.typeAnnotation.type !== "TSTypeReference") &&
      (arg.body.type === "BlockStatement" ||
        arg.body.type === "ArrowFunctionExpression" ||
        arg.body.type === "ObjectExpression" ||
        arg.body.type === "ArrayExpression" ||
        arg.body.type === "CallExpression" ||
        arg.body.type === "OptionalCallExpression" ||
        arg.body.type === "ConditionalExpression" ||
        isJSXNode(arg.body)))
  );
}

function shouldGroupLastArg(args) {
  const lastArg = getLast(args);
  const penultimateArg = getPenultimate(args);
  return (
    !hasLeadingComment(lastArg) &&
    !hasTrailingComment(lastArg) &&
    couldGroupArg(lastArg) &&
    // If the last two arguments are of the same type,
    // disable last element expansion.
    (!penultimateArg || penultimateArg.type !== lastArg.type)
  );
}

function shouldGroupFirstArg(args) {
  if (args.length !== 2) {
    return false;
  }

  const firstArg = args[0];
  const secondArg = args[1];
  return (
    (!firstArg.comments || !firstArg.comments.length) &&
    (firstArg.type === "FunctionExpression" ||
      (firstArg.type === "ArrowFunctionExpression" &&
        firstArg.body.type === "BlockStatement")) &&
    secondArg.type !== "FunctionExpression" &&
    secondArg.type !== "ArrowFunctionExpression" &&
    secondArg.type !== "ConditionalExpression" &&
    !couldGroupArg(secondArg)
  );
}

function printJestEachTemplateLiteral(node, expressions, options) {
  /**
   * a    | b    | expected
   * ${1} | ${1} | ${2}
   * ${1} | ${2} | ${3}
   * ${2} | ${1} | ${3}
   */
  const headerNames = node.quasis[0].value.raw.trim().split(/\s*\|\s*/);
  if (
    headerNames.length > 1 ||
    headerNames.some(headerName => headerName.length !== 0)
  ) {
    const parts = [];
    const stringifiedExpressions = expressions.map(
      doc =>
        "${" +
        printDocToString(
          doc,
          Object.assign({}, options, {
            printWidth: Infinity,
            endOfLine: "lf"
          })
        ).formatted +
        "}"
    );

    const tableBody = [{ hasLineBreak: false, cells: [] }];
    for (let i = 1; i < node.quasis.length; i++) {
      const row = tableBody[tableBody.length - 1];
      const correspondingExpression = stringifiedExpressions[i - 1];

      row.cells.push(correspondingExpression);
      if (correspondingExpression.indexOf("\n") !== -1) {
        row.hasLineBreak = true;
      }

      if (node.quasis[i].value.raw.indexOf("\n") !== -1) {
        tableBody.push({ hasLineBreak: false, cells: [] });
      }
    }

    const maxColumnCount = tableBody.reduce(
      (maxColumnCount, row) => Math.max(maxColumnCount, row.cells.length),
      headerNames.length
    );

    const maxColumnWidths = Array.from(new Array(maxColumnCount), () => 0);
    const table = [{ cells: headerNames }].concat(
      tableBody.filter(row => row.cells.length !== 0)
    );
    table
      .filter(row => !row.hasLineBreak)
      .forEach(row => {
        row.cells.forEach((cell, index) => {
          maxColumnWidths[index] = Math.max(
            maxColumnWidths[index],
            getStringWidth(cell)
          );
        });
      });

    parts.push(
      lineSuffixBoundary,
      "`",
      indent(
        concat([
          hardline,
          join(
            hardline,
            table.map(row =>
              join(
                " | ",
                row.cells.map((cell, index) =>
                  row.hasLineBreak
                    ? cell
                    : cell +
                      " ".repeat(maxColumnWidths[index] - getStringWidth(cell))
                )
              )
            )
          )
        ])
      ),
      hardline,
      "`"
    );
    return concat(parts);
  }
}

function printArgumentsList(path, options, print) {
  const node = path.getValue();
  const args = node.arguments;

  if (args.length === 0) {
    return concat([
      "(",
      comments.printDanglingComments(path, options, /* sameIndent */ true),
      ")"
    ]);
  }

  // useEffect(() => { ... }, [foo, bar, baz])
  if (
    args.length === 2 &&
    args[0].type === "ArrowFunctionExpression" &&
    args[0].params.length === 0 &&
    args[0].body.type === "BlockStatement" &&
    args[1].type === "ArrayExpression" &&
    !args.find(arg => arg.comments)
  ) {
    return concat([
      "(",
      path.call(print, "arguments", 0),
      ", ",
      path.call(print, "arguments", 1),
      ")"
    ]);
  }

  // func(
  //   ({
  //     a,

  //     b
  //   }) => {}
  // );
  function shouldBreakForArrowFunctionInArguments(arg, argPath) {
    if (
      !arg ||
      arg.type !== "ArrowFunctionExpression" ||
      !arg.body ||
      arg.body.type !== "BlockStatement" ||
      !arg.params ||
      arg.params.length < 1
    ) {
      return false;
    }

    let shouldBreak = false;
    argPath.each(paramPath => {
      const printed = concat([print(paramPath)]);
      shouldBreak = shouldBreak || willBreak(printed);
    }, "params");

    return shouldBreak;
  }

  let anyArgEmptyLine = false;
  let shouldBreakForArrowFunction = false;
  let hasEmptyLineFollowingFirstArg = false;
  const lastArgIndex = args.length - 1;
  const printedArguments = path.map((argPath, index) => {
    const arg = argPath.getNode();
    const parts = [print(argPath)];

    if (index === lastArgIndex) {
      // do nothing
    } else if (isNextLineEmpty(options.originalText, arg, options)) {
      if (index === 0) {
        hasEmptyLineFollowingFirstArg = true;
      }

      anyArgEmptyLine = true;
      parts.push(",", hardline, hardline);
    } else {
      parts.push(",", line);
    }

    shouldBreakForArrowFunction = shouldBreakForArrowFunctionInArguments(
      arg,
      argPath
    );

    return concat(parts);
  }, "arguments");

  const maybeTrailingComma =
    // Dynamic imports cannot have trailing commas
    !(node.callee && node.callee.type === "Import") &&
    shouldPrintComma(options, "all")
      ? ","
      : "";

  function allArgsBrokenOut() {
    return group(
      concat([
        "(",
        indent(concat([line, concat(printedArguments)])),
        maybeTrailingComma,
        line,
        ")"
      ]),
      { shouldBreak: true }
    );
  }

  if (isFunctionCompositionArgs(args)) {
    return allArgsBrokenOut();
  }

  const shouldGroupFirst = shouldGroupFirstArg(args);
  const shouldGroupLast = shouldGroupLastArg(args);
  if (shouldGroupFirst || shouldGroupLast) {
    const shouldBreak =
      (shouldGroupFirst
        ? printedArguments.slice(1).some(willBreak)
        : printedArguments.slice(0, -1).some(willBreak)) ||
      anyArgEmptyLine ||
      shouldBreakForArrowFunction;

    // We want to print the last argument with a special flag
    let printedExpanded;
    let i = 0;
    path.each(argPath => {
      if (shouldGroupFirst && i === 0) {
        printedExpanded = [
          concat([
            argPath.call(p => print(p, { expandFirstArg: true })),
            printedArguments.length > 1 ? "," : "",
            hasEmptyLineFollowingFirstArg ? hardline : line,
            hasEmptyLineFollowingFirstArg ? hardline : ""
          ])
        ].concat(printedArguments.slice(1));
      }
      if (shouldGroupLast && i === args.length - 1) {
        printedExpanded = printedArguments
          .slice(0, -1)
          .concat(argPath.call(p => print(p, { expandLastArg: true })));
      }
      i++;
    }, "arguments");

    const somePrintedArgumentsWillBreak = printedArguments.some(willBreak);

    const simpleConcat = concat(["(", concat(printedExpanded), ")"]);

    return concat([
      somePrintedArgumentsWillBreak ? breakParent : "",
      conditionalGroup(
        [
          !somePrintedArgumentsWillBreak &&
          !node.typeArguments &&
          !node.typeParameters
            ? simpleConcat
            : ifBreak(allArgsBrokenOut(), simpleConcat),
          shouldGroupFirst
            ? concat([
                "(",
                group(printedExpanded[0], { shouldBreak: true }),
                concat(printedExpanded.slice(1)),
                ")"
              ])
            : concat([
                "(",
                concat(printedArguments.slice(0, -1)),
                group(getLast(printedExpanded), {
                  shouldBreak: true
                }),
                ")"
              ]),
          allArgsBrokenOut()
        ],
        { shouldBreak }
      )
    ]);
  }

  const contents = concat([
    "(",
    indent(concat([softline, concat(printedArguments)])),
    ifBreak(maybeTrailingComma),
    softline,
    ")"
  ]);
  if (isLongCurriedCallExpression(path)) {
    // By not wrapping the arguments in a group, the printer prioritizes
    // breaking up these arguments rather than the args of the parent call.
    return contents;
  }

  return group(contents, {
    shouldBreak: printedArguments.some(willBreak) || anyArgEmptyLine
  });
}

function printTypeAnnotation(path, options, print) {
  const node = path.getValue();
  if (!node.typeAnnotation) {
    return "";
  }

  const parentNode = path.getParentNode();
  const isDefinite =
    node.definite ||
    (parentNode &&
      parentNode.type === "VariableDeclarator" &&
      parentNode.definite);

  const isFunctionDeclarationIdentifier =
    parentNode.type === "DeclareFunction" && parentNode.id === node;

  if (
    isFlowAnnotationComment(options.originalText, node.typeAnnotation, options)
  ) {
    return concat([" /*: ", path.call(print, "typeAnnotation"), " */"]);
  }

  return concat([
    isFunctionDeclarationIdentifier ? "" : isDefinite ? "!: " : ": ",
    path.call(print, "typeAnnotation")
  ]);
}

function printFunctionTypeParameters(path, options, print) {
  const fun = path.getValue();
  if (fun.typeArguments) {
    return path.call(print, "typeArguments");
  }
  if (fun.typeParameters) {
    return path.call(print, "typeParameters");
  }
  return "";
}

function printFunctionParams(path, print, options, expandArg, printTypeParams) {
  const fun = path.getValue();
  const parent = path.getParentNode();
  const paramsField = fun.parameters ? "parameters" : "params";
  const isParametersInTestCall = isTestCall(parent);
  const shouldHugParameters = shouldHugArguments(fun);
  const shouldExpandParameters =
    expandArg && !(fun[paramsField] && fun[paramsField].some(n => n.comments));

  const typeParams = printTypeParams
    ? printFunctionTypeParameters(path, options, print)
    : "";

  let printed = [];
  if (fun[paramsField]) {
    const lastArgIndex = fun[paramsField].length - 1;

    printed = path.map((childPath, index) => {
      const parts = [];
      const param = childPath.getValue();

      parts.push(print(childPath));

      if (index === lastArgIndex) {
        if (fun.rest) {
          parts.push(",", line);
        }
      } else if (
        isParametersInTestCall ||
        shouldHugParameters ||
        shouldExpandParameters
      ) {
        parts.push(", ");
      } else if (isNextLineEmpty(options.originalText, param, options)) {
        parts.push(",", hardline, hardline);
      } else {
        parts.push(",", line);
      }

      return concat(parts);
    }, paramsField);
  }

  if (fun.rest) {
    printed.push(concat(["...", path.call(print, "rest")]));
  }

  if (printed.length === 0) {
    return concat([
      typeParams,
      "(",
      comments.printDanglingComments(
        path,
        options,
        /* sameIndent */ true,
        comment =>
          getNextNonSpaceNonCommentCharacter(
            options.originalText,
            comment,
            options.locEnd
          ) === ")"
      ),
      ")"
    ]);
  }

  const lastParam = getLast(fun[paramsField]);

  // If the parent is a call with the first/last argument expansion and this is the
  // params of the first/last argument, we don't want the arguments to break and instead
  // want the whole expression to be on a new line.
  //
  // Good:                 Bad:
  //   verylongcall(         verylongcall((
  //     (a, b) => {           a,
  //     }                     b,
  //   })                    ) => {
  //                         })
  if (shouldExpandParameters) {
    return group(
      concat([
        removeLines(typeParams),
        "(",
        concat(printed.map(removeLines)),
        ")"
      ])
    );
  }

  // Single object destructuring should hug
  //
  // function({
  //   a,
  //   b,
  //   c
  // }) {}
  const hasNotParameterDecorator = fun[paramsField].every(
    param => !param.decorators
  );
  if (shouldHugParameters && hasNotParameterDecorator) {
    return concat([typeParams, "(", concat(printed), ")"]);
  }

  // don't break in specs, eg; `it("should maintain parens around done even when long", (done) => {})`
  if (isParametersInTestCall) {
    return concat([typeParams, "(", concat(printed), ")"]);
  }

  const isFlowShorthandWithOneArg =
    (isObjectTypePropertyAFunction(parent, options) ||
      isTypeAnnotationAFunction(parent, options) ||
      parent.type === "TypeAlias" ||
      parent.type === "UnionTypeAnnotation" ||
      parent.type === "TSUnionType" ||
      parent.type === "IntersectionTypeAnnotation" ||
      (parent.type === "FunctionTypeAnnotation" &&
        parent.returnType === fun)) &&
    fun[paramsField].length === 1 &&
    fun[paramsField][0].name === null &&
    fun[paramsField][0].typeAnnotation &&
    fun.typeParameters === null &&
    isSimpleFlowType(fun[paramsField][0].typeAnnotation) &&
    !fun.rest;

  if (isFlowShorthandWithOneArg) {
    if (options.arrowParens === "always") {
      return concat(["(", concat(printed), ")"]);
    }
    return concat(printed);
  }

  const canHaveTrailingComma =
    !(lastParam && lastParam.type === "RestElement") && !fun.rest;

  return concat([
    typeParams,
    "(",
    indent(concat([softline, concat(printed)])),
    ifBreak(
      canHaveTrailingComma && shouldPrintComma(options, "all") ? "," : ""
    ),
    softline,
    ")"
  ]);
}

function shouldPrintParamsWithoutParens(path, options) {
  if (options.arrowParens === "always") {
    return false;
  }

  if (options.arrowParens === "avoid") {
    const node = path.getValue();
    return canPrintParamsWithoutParens(node);
  }

  // Fallback default; should be unreachable
  return false;
}

function canPrintParamsWithoutParens(node) {
  return (
    node.params.length === 1 &&
    !node.rest &&
    !node.typeParameters &&
    !hasDanglingComments(node) &&
    node.params[0].type === "Identifier" &&
    !node.params[0].typeAnnotation &&
    !node.params[0].comments &&
    !node.params[0].optional &&
    !node.predicate &&
    !node.returnType
  );
}

function printFunctionDeclaration(path, print, options) {
  const n = path.getValue();
  const parts = [];

  if (n.async) {
    parts.push("async ");
  }

  parts.push("function");

  if (n.generator) {
    parts.push("*");
  }
  if (n.id) {
    parts.push(" ", path.call(print, "id"));
  }

  parts.push(
    printFunctionTypeParameters(path, options, print),
    group(
      concat([
        printFunctionParams(path, print, options),
        printReturnType(path, print, options)
      ])
    ),
    n.body ? " " : "",
    path.call(print, "body")
  );

  return concat(parts);
}

function printReturnType(path, print, options) {
  const n = path.getValue();
  const returnType = path.call(print, "returnType");

  if (
    n.returnType &&
    isFlowAnnotationComment(options.originalText, n.returnType, options)
  ) {
    return concat([" /*: ", returnType, " */"]);
  }

  const parts = [returnType];

  // prepend colon to TypeScript type annotation
  if (n.returnType && n.returnType.typeAnnotation) {
    parts.unshift(": ");
  }

  if (n.predicate) {
    // The return type will already add the colon, but otherwise we
    // need to do it ourselves
    parts.push(n.returnType ? " " : ": ", path.call(print, "predicate"));
  }

  return concat(parts);
}

function printExportDeclaration(path, options, print) {
  const decl = path.getValue();
  const semi = options.semi ? ";" : "";
  const parts = ["export "];

  const isDefault = decl["default"] || decl.type === "ExportDefaultDeclaration";

  if (isDefault) {
    parts.push("default ");
  }

  parts.push(
    comments.printDanglingComments(path, options, /* sameIndent */ true)
  );

  if (needsHardlineAfterDanglingComment(decl)) {
    parts.push(hardline);
  }

  if (decl.declaration) {
    parts.push(path.call(print, "declaration"));

    if (
      isDefault &&
      decl.declaration.type !== "ClassDeclaration" &&
      decl.declaration.type !== "FunctionDeclaration" &&
      decl.declaration.type !== "TSInterfaceDeclaration" &&
      decl.declaration.type !== "DeclareClass" &&
      decl.declaration.type !== "DeclareFunction" &&
      decl.declaration.type !== "TSDeclareFunction"
    ) {
      parts.push(semi);
    }
  } else {
    if (decl.specifiers && decl.specifiers.length > 0) {
      const specifiers = [];
      const defaultSpecifiers = [];
      const namespaceSpecifiers = [];
      path.each(specifierPath => {
        const specifierType = path.getValue().type;
        if (specifierType === "ExportSpecifier") {
          specifiers.push(print(specifierPath));
        } else if (specifierType === "ExportDefaultSpecifier") {
          defaultSpecifiers.push(print(specifierPath));
        } else if (specifierType === "ExportNamespaceSpecifier") {
          namespaceSpecifiers.push(concat(["* as ", print(specifierPath)]));
        }
      }, "specifiers");

      const isNamespaceFollowed =
        namespaceSpecifiers.length !== 0 && specifiers.length !== 0;

      const isDefaultFollowed =
        defaultSpecifiers.length !== 0 &&
        (namespaceSpecifiers.length !== 0 || specifiers.length !== 0);

      const canBreak =
        specifiers.length > 1 ||
        defaultSpecifiers.length > 0 ||
        (decl.specifiers && decl.specifiers.some(node => node.comments));

      let printed = "";
      if (specifiers.length !== 0) {
        if (canBreak) {
          printed = group(
            concat([
              "{",
              indent(
                concat([
                  options.bracketSpacing ? line : softline,
                  join(concat([",", line]), specifiers)
                ])
              ),
              ifBreak(shouldPrintComma(options) ? "," : ""),
              options.bracketSpacing ? line : softline,
              "}"
            ])
          );
        } else {
          printed = concat([
            "{",
            options.bracketSpacing ? " " : "",
            concat(specifiers),
            options.bracketSpacing ? " " : "",
            "}"
          ]);
        }
      }

      parts.push(
        decl.exportKind === "type" ? "type " : "",
        concat(defaultSpecifiers),
        concat([isDefaultFollowed ? ", " : ""]),
        concat(namespaceSpecifiers),
        concat([isNamespaceFollowed ? ", " : ""]),
        printed
      );
    } else {
      parts.push("{}");
    }

    if (decl.source) {
      parts.push(" from ", path.call(print, "source"));
    }

    parts.push(semi);
  }

  return concat(parts);
}

function printFlowDeclaration(path, parts) {
  const parentExportDecl = getParentExportDeclaration(path);

  if (parentExportDecl) {
    assert.strictEqual(parentExportDecl.type, "DeclareExportDeclaration");
  } else {
    // If the parent node has type DeclareExportDeclaration, then it
    // will be responsible for printing the "declare" token. Otherwise
    // it needs to be printed with this non-exported declaration node.
    parts.unshift("declare ");
  }

  return concat(parts);
}

function printTypeScriptModifiers(path, options, print) {
  const n = path.getValue();
  if (!n.modifiers || !n.modifiers.length) {
    return "";
  }
  return concat([join(" ", path.map(print, "modifiers")), " "]);
}

function printTypeParameters(path, options, print, paramsKey) {
  const n = path.getValue();

  if (!n[paramsKey]) {
    return "";
  }

  // for TypeParameterDeclaration typeParameters is a single node
  if (!Array.isArray(n[paramsKey])) {
    return path.call(print, paramsKey);
  }

  const grandparent = path.getNode(2);
  const greatGreatGrandParent = path.getNode(4);

  const isParameterInTestCall = grandparent != null && isTestCall(grandparent);

  const shouldInline =
    isParameterInTestCall ||
    n[paramsKey].length === 0 ||
    (n[paramsKey].length === 1 &&
      (shouldHugType(n[paramsKey][0]) ||
        (n[paramsKey][0].type === "GenericTypeAnnotation" &&
          shouldHugType(n[paramsKey][0].id)) ||
        (n[paramsKey][0].type === "TSTypeReference" &&
          shouldHugType(n[paramsKey][0].typeName)) ||
        n[paramsKey][0].type === "NullableTypeAnnotation" ||
        // See https://github.com/prettier/prettier/pull/6467 for the context.
        (greatGreatGrandParent &&
          greatGreatGrandParent.type === "VariableDeclarator" &&
          grandparent &&
          grandparent.type === "TSTypeAnnotation" &&
          n[paramsKey][0].type !== "TSUnionType" &&
          n[paramsKey][0].type !== "UnionTypeAnnotation" &&
          n[paramsKey][0].type !== "TSConditionalType" &&
          n[paramsKey][0].type !== "TSMappedType")));

  if (shouldInline) {
    return concat(["<", join(", ", path.map(print, paramsKey)), ">"]);
  }

  return group(
    concat([
      "<",
      indent(
        concat([
          softline,
          join(concat([",", line]), path.map(print, paramsKey))
        ])
      ),
      ifBreak(
        options.parser !== "typescript" && shouldPrintComma(options, "all")
          ? ","
          : ""
      ),
      softline,
      ">"
    ])
  );
}

function printClass(path, options, print) {
  const n = path.getValue();
  const parts = [];

  if (n.abstract) {
    parts.push("abstract ");
  }

  parts.push("class");

  if (n.id) {
    parts.push(" ", path.call(print, "id"));
  }

  parts.push(path.call(print, "typeParameters"));

  const partsGroup = [];
  if (n.superClass) {
    const printed = concat([
      "extends ",
      path.call(print, "superClass"),
      path.call(print, "superTypeParameters")
    ]);
    // Keep old behaviour of extends in same line
    // If there is only on extends and there are not comments
    if (
      (!n.implements || n.implements.length === 0) &&
      (!n.superClass.comments || n.superClass.comments.length === 0)
    ) {
      parts.push(
        concat([
          " ",
          path.call(
            superClass =>
              comments.printComments(superClass, () => printed, options),
            "superClass"
          )
        ])
      );
    } else {
      partsGroup.push(
        group(
          concat([
            line,
            path.call(
              superClass =>
                comments.printComments(superClass, () => printed, options),
              "superClass"
            )
          ])
        )
      );
    }
  } else if (n.extends && n.extends.length > 0) {
    parts.push(" extends ", join(", ", path.map(print, "extends")));
  }

  if (n["mixins"] && n["mixins"].length > 0) {
    partsGroup.push(
      line,
      "mixins ",
      group(indent(join(concat([",", line]), path.map(print, "mixins"))))
    );
  }

  if (n["implements"] && n["implements"].length > 0) {
    partsGroup.push(
      line,
      "implements",
      group(
        indent(
          concat([
            line,
            join(concat([",", line]), path.map(print, "implements"))
          ])
        )
      )
    );
  }

  if (partsGroup.length > 0) {
    parts.push(group(indent(concat(partsGroup))));
  }

  if (
    n.body &&
    n.body.comments &&
    hasLeadingOwnLineComment(options.originalText, n.body, options)
  ) {
    parts.push(hardline);
  } else {
    parts.push(" ");
  }
  parts.push(path.call(print, "body"));

  return parts;
}

function printOptionalToken(path) {
  const node = path.getValue();
  if (
    !node.optional ||
    // It's an optional computed method parsed by typescript-estree.
    // "?" is printed in `printMethod`.
    (node.type === "Identifier" && node === path.getParentNode().key)
  ) {
    return "";
  }
  if (
    node.type === "OptionalCallExpression" ||
    (node.type === "OptionalMemberExpression" && node.computed)
  ) {
    return "?.";
  }
  return "?";
}

function printMemberLookup(path, options, print) {
  const property = path.call(print, "property");
  const n = path.getValue();
  const optional = printOptionalToken(path);

  if (!n.computed) {
    return concat([optional, ".", property]);
  }

  if (!n.property || isNumericLiteral(n.property)) {
    return concat([optional, "[", property, "]"]);
  }

  return group(
    concat([optional, "[", indent(concat([softline, property])), softline, "]"])
  );
}

function printBindExpressionCallee(path, options, print) {
  return concat(["::", path.call(print, "callee")]);
}

// We detect calls on member expressions specially to format a
// common pattern better. The pattern we are looking for is this:
//
// arr
//   .map(x => x + 1)
//   .filter(x => x > 10)
//   .some(x => x % 2)
//
// The way it is structured in the AST is via a nested sequence of
// MemberExpression and CallExpression. We need to traverse the AST
// and make groups out of it to print it in the desired way.
function printMemberChain(path, options, print) {
  // The first phase is to linearize the AST by traversing it down.
  //
  //   a().b()
  // has the following AST structure:
  //   CallExpression(MemberExpression(CallExpression(Identifier)))
  // and we transform it into
  //   [Identifier, CallExpression, MemberExpression, CallExpression]
  const printedNodes = [];

  // Here we try to retain one typed empty line after each call expression or
  // the first group whether it is in parentheses or not
  function shouldInsertEmptyLineAfter(node) {
    const originalText = options.originalText;
    const nextCharIndex = getNextNonSpaceNonCommentCharacterIndex(
      originalText,
      node,
      options
    );
    const nextChar = originalText.charAt(nextCharIndex);

    // if it is cut off by a parenthesis, we only account for one typed empty
    // line after that parenthesis
    if (nextChar == ")") {
      return isNextLineEmptyAfterIndex(
        originalText,
        nextCharIndex + 1,
        options
      );
    }

    return isNextLineEmpty(originalText, node, options);
  }

  function rec(path) {
    const node = path.getValue();
    if (
      (node.type === "CallExpression" ||
        node.type === "OptionalCallExpression") &&
      (isMemberish(node.callee) ||
        node.callee.type === "CallExpression" ||
        node.callee.type === "OptionalCallExpression")
    ) {
      printedNodes.unshift({
        node: node,
        printed: concat([
          comments.printComments(
            path,
            () =>
              concat([
                printOptionalToken(path),
                printFunctionTypeParameters(path, options, print),
                printArgumentsList(path, options, print)
              ]),
            options
          ),
          shouldInsertEmptyLineAfter(node) ? hardline : ""
        ])
      });
      path.call(callee => rec(callee), "callee");
    } else if (isMemberish(node)) {
      printedNodes.unshift({
        node: node,
        needsParens: pathNeedsParens(path, options),
        printed: comments.printComments(
          path,
          () =>
            node.type === "OptionalMemberExpression" ||
            node.type === "MemberExpression"
              ? printMemberLookup(path, options, print)
              : printBindExpressionCallee(path, options, print),
          options
        )
      });
      path.call(object => rec(object), "object");
    } else if (node.type === "TSNonNullExpression") {
      printedNodes.unshift({
        node: node,
        printed: comments.printComments(path, () => "!", options)
      });
      path.call(expression => rec(expression), "expression");
    } else {
      printedNodes.unshift({
        node: node,
        printed: path.call(print)
      });
    }
  }
  // Note: the comments of the root node have already been printed, so we
  // need to extract this first call without printing them as they would
  // if handled inside of the recursive call.
  const node = path.getValue();
  printedNodes.unshift({
    node,
    printed: concat([
      printOptionalToken(path),
      printFunctionTypeParameters(path, options, print),
      printArgumentsList(path, options, print)
    ])
  });
  path.call(callee => rec(callee), "callee");

  // Once we have a linear list of printed nodes, we want to create groups out
  // of it.
  //
  //   a().b.c().d().e
  // will be grouped as
  //   [
  //     [Identifier, CallExpression],
  //     [MemberExpression, MemberExpression, CallExpression],
  //     [MemberExpression, CallExpression],
  //     [MemberExpression],
  //   ]
  // so that we can print it as
  //   a()
  //     .b.c()
  //     .d()
  //     .e

  // The first group is the first node followed by
  //   - as many CallExpression as possible
  //       < fn()()() >.something()
  //   - as many array accessors as possible
  //       < fn()[0][1][2] >.something()
  //   - then, as many MemberExpression as possible but the last one
  //       < this.items >.something()
  const groups = [];
  let currentGroup = [printedNodes[0]];
  let i = 1;
  for (; i < printedNodes.length; ++i) {
    if (
      printedNodes[i].node.type === "TSNonNullExpression" ||
      printedNodes[i].node.type === "OptionalCallExpression" ||
      printedNodes[i].node.type === "CallExpression" ||
      ((printedNodes[i].node.type === "MemberExpression" ||
        printedNodes[i].node.type === "OptionalMemberExpression") &&
        printedNodes[i].node.computed &&
        isNumericLiteral(printedNodes[i].node.property))
    ) {
      currentGroup.push(printedNodes[i]);
    } else {
      break;
    }
  }
  if (
    printedNodes[0].node.type !== "CallExpression" &&
    printedNodes[0].node.type !== "OptionalCallExpression"
  ) {
    for (; i + 1 < printedNodes.length; ++i) {
      if (
        isMemberish(printedNodes[i].node) &&
        isMemberish(printedNodes[i + 1].node)
      ) {
        currentGroup.push(printedNodes[i]);
      } else {
        break;
      }
    }
  }
  groups.push(currentGroup);
  currentGroup = [];

  // Then, each following group is a sequence of MemberExpression followed by
  // a sequence of CallExpression. To compute it, we keep adding things to the
  // group until we has seen a CallExpression in the past and reach a
  // MemberExpression
  let hasSeenCallExpression = false;
  for (; i < printedNodes.length; ++i) {
    if (hasSeenCallExpression && isMemberish(printedNodes[i].node)) {
      // [0] should be appended at the end of the group instead of the
      // beginning of the next one
      if (
        printedNodes[i].node.computed &&
        isNumericLiteral(printedNodes[i].node.property)
      ) {
        currentGroup.push(printedNodes[i]);
        continue;
      }

      groups.push(currentGroup);
      currentGroup = [];
      hasSeenCallExpression = false;
    }

    if (
      printedNodes[i].node.type === "CallExpression" ||
      printedNodes[i].node.type === "OptionalCallExpression"
    ) {
      hasSeenCallExpression = true;
    }
    currentGroup.push(printedNodes[i]);

    if (
      printedNodes[i].node.comments &&
      printedNodes[i].node.comments.some(comment => comment.trailing)
    ) {
      groups.push(currentGroup);
      currentGroup = [];
      hasSeenCallExpression = false;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // There are cases like Object.keys(), Observable.of(), _.values() where
  // they are the subject of all the chained calls and therefore should
  // be kept on the same line:
  //
  //   Object.keys(items)
  //     .filter(x => x)
  //     .map(x => x)
  //
  // In order to detect those cases, we use an heuristic: if the first
  // node is an identifier with the name starting with a capital
  // letter or just a sequence of _$. The rationale is that they are
  // likely to be factories.
  function isFactory(name) {
    return /^[A-Z]|^[_$]+$/.test(name);
  }

  // In case the Identifier is shorter than tab width, we can keep the
  // first call in a single line, if it's an ExpressionStatement.
  //
  //   d3.scaleLinear()
  //     .domain([0, 100])
  //     .range([0, width]);
  //
  function isShort(name) {
    return name.length <= options.tabWidth;
  }

  function shouldNotWrap(groups) {
    const parent = path.getParentNode();
    const isExpression = parent && parent.type === "ExpressionStatement";
    const hasComputed = groups[1].length && groups[1][0].node.computed;

    if (groups[0].length === 1) {
      const firstNode = groups[0][0].node;
      return (
        firstNode.type === "ThisExpression" ||
        (firstNode.type === "Identifier" &&
          (isFactory(firstNode.name) ||
            (isExpression && isShort(firstNode.name)) ||
            hasComputed))
      );
    }

    const lastNode = getLast(groups[0]).node;
    return (
      (lastNode.type === "MemberExpression" ||
        lastNode.type === "OptionalMemberExpression") &&
      lastNode.property.type === "Identifier" &&
      (isFactory(lastNode.property.name) || hasComputed)
    );
  }

  const shouldMerge =
    groups.length >= 2 && !groups[1][0].node.comments && shouldNotWrap(groups);

  function printGroup(printedGroup) {
    const printed = printedGroup.map(tuple => tuple.printed);
    // Checks if the last node (i.e. the parent node) needs parens and print
    // accordingly
    if (
      printedGroup.length > 0 &&
      printedGroup[printedGroup.length - 1].needsParens
    ) {
      return concat(["(", ...printed, ")"]);
    }
    return concat(printed);
  }

  function printIndentedGroup(groups) {
    if (groups.length === 0) {
      return "";
    }
    return indent(
      group(concat([hardline, join(hardline, groups.map(printGroup))]))
    );
  }

  const printedGroups = groups.map(printGroup);
  const oneLine = concat(printedGroups);

  const cutoff = shouldMerge ? 3 : 2;
  const flatGroups = groups
    .slice(0, cutoff)
    .reduce((res, group) => res.concat(group), []);

  const hasComment =
    flatGroups.slice(1, -1).some(node => hasLeadingComment(node.node)) ||
    flatGroups.slice(0, -1).some(node => hasTrailingComment(node.node)) ||
    (groups[cutoff] && hasLeadingComment(groups[cutoff][0].node));

  // If we only have a single `.`, we shouldn't do anything fancy and just
  // render everything concatenated together.
  if (groups.length <= cutoff && !hasComment) {
    if (isLongCurriedCallExpression(path)) {
      return oneLine;
    }
    return group(oneLine);
  }

  // Find out the last node in the first group and check if it has an
  // empty line after
  const lastNodeBeforeIndent = getLast(
    shouldMerge ? groups.slice(1, 2)[0] : groups[0]
  ).node;
  const shouldHaveEmptyLineBeforeIndent =
    lastNodeBeforeIndent.type !== "CallExpression" &&
    lastNodeBeforeIndent.type !== "OptionalCallExpression" &&
    shouldInsertEmptyLineAfter(lastNodeBeforeIndent);

  const expanded = concat([
    printGroup(groups[0]),
    shouldMerge ? concat(groups.slice(1, 2).map(printGroup)) : "",
    shouldHaveEmptyLineBeforeIndent ? hardline : "",
    printIndentedGroup(groups.slice(shouldMerge ? 2 : 1))
  ]);

  const callExpressions = printedNodes
    .map(({ node }) => node)
    .filter(isCallOrOptionalCallExpression);

  // We don't want to print in one line if there's:
  //  * A comment.
  //  * 3 or more chained calls.
  //  * Any group but the last one has a hard line.
  // If the last group is a function it's okay to inline if it fits.
  if (
    hasComment ||
    callExpressions.length >= 3 ||
    printedGroups.slice(0, -1).some(willBreak) ||
    /**
     *     scopes.filter(scope => scope.value !== '').map((scope, i) => {
     *       // multi line content
     *     })
     */
    (((lastGroupDoc, lastGroupNode) =>
      isCallOrOptionalCallExpression(lastGroupNode) && willBreak(lastGroupDoc))(
      getLast(printedGroups),
      getLast(getLast(groups)).node
    ) &&
      callExpressions
        .slice(0, -1)
        .some(n => n.arguments.some(isFunctionOrArrowExpression)))
  ) {
    return group(expanded);
  }

  return concat([
    // We only need to check `oneLine` because if `expanded` is chosen
    // that means that the parent group has already been broken
    // naturally
    willBreak(oneLine) || shouldHaveEmptyLineBeforeIndent ? breakParent : "",
    conditionalGroup([oneLine, expanded])
  ]);
}

function separatorNoWhitespace(
  isFacebookTranslationTag,
  child,
  childNode,
  nextNode
) {
  if (isFacebookTranslationTag) {
    return "";
  }

  if (
    (childNode.type === "JSXElement" && !childNode.closingElement) ||
    (nextNode && nextNode.type === "JSXElement" && !nextNode.closingElement)
  ) {
    return child.length === 1 ? softline : hardline;
  }

  return softline;
}

function separatorWithWhitespace(
  isFacebookTranslationTag,
  child,
  childNode,
  nextNode
) {
  if (isFacebookTranslationTag) {
    return hardline;
  }

  if (child.length === 1) {
    return (childNode.type === "JSXElement" && !childNode.closingElement) ||
      (nextNode && nextNode.type === "JSXElement" && !nextNode.closingElement)
      ? hardline
      : softline;
  }

  return hardline;
}

// JSX Children are strange, mostly for two reasons:
// 1. JSX reads newlines into string values, instead of skipping them like JS
// 2. up to one whitespace between elements within a line is significant,
//    but not between lines.
//
// Leading, trailing, and lone whitespace all need to
// turn themselves into the rather ugly `{' '}` when breaking.
//
// We print JSX using the `fill` doc primitive.
// This requires that we give it an array of alternating
// content and whitespace elements.
// To ensure this we add dummy `""` content elements as needed.
function printJSXChildren(
  path,
  options,
  print,
  jsxWhitespace,
  isFacebookTranslationTag
) {
  const n = path.getValue();
  const children = [];

  // using `map` instead of `each` because it provides `i`
  path.map((childPath, i) => {
    const child = childPath.getValue();
    if (isLiteral(child)) {
      const text = rawText(child);

      // Contains a non-whitespace character
      if (isMeaningfulJSXText(child)) {
        const words = text.split(matchJsxWhitespaceRegex);

        // Starts with whitespace
        if (words[0] === "") {
          children.push("");
          words.shift();
          if (/\n/.test(words[0])) {
            const next = n.children[i + 1];
            children.push(
              separatorWithWhitespace(
                isFacebookTranslationTag,
                words[1],
                child,
                next
              )
            );
          } else {
            children.push(jsxWhitespace);
          }
          words.shift();
        }

        let endWhitespace;
        // Ends with whitespace
        if (getLast(words) === "") {
          words.pop();
          endWhitespace = words.pop();
        }

        // This was whitespace only without a new line.
        if (words.length === 0) {
          return;
        }

        words.forEach((word, i) => {
          if (i % 2 === 1) {
            children.push(line);
          } else {
            children.push(word);
          }
        });

        if (endWhitespace !== undefined) {
          if (/\n/.test(endWhitespace)) {
            const next = n.children[i + 1];
            children.push(
              separatorWithWhitespace(
                isFacebookTranslationTag,
                getLast(children),
                child,
                next
              )
            );
          } else {
            children.push(jsxWhitespace);
          }
        } else {
          const next = n.children[i + 1];
          children.push(
            separatorNoWhitespace(
              isFacebookTranslationTag,
              getLast(children),
              child,
              next
            )
          );
        }
      } else if (/\n/.test(text)) {
        // Keep (up to one) blank line between tags/expressions/text.
        // Note: We don't keep blank lines between text elements.
        if (text.match(/\n/g).length > 1) {
          children.push("");
          children.push(hardline);
        }
      } else {
        children.push("");
        children.push(jsxWhitespace);
      }
    } else {
      const printedChild = print(childPath);
      children.push(printedChild);

      const next = n.children[i + 1];
      const directlyFollowedByMeaningfulText =
        next && isMeaningfulJSXText(next);
      if (directlyFollowedByMeaningfulText) {
        const firstWord = rawText(next)
          .trim()
          .split(matchJsxWhitespaceRegex)[0];
        children.push(
          separatorNoWhitespace(
            isFacebookTranslationTag,
            firstWord,
            child,
            next
          )
        );
      } else {
        children.push(hardline);
      }
    }
  }, "children");

  return children;
}

// JSX expands children from the inside-out, instead of the outside-in.
// This is both to break children before attributes,
// and to ensure that when children break, their parents do as well.
//
// Any element that is written without any newlines and fits on a single line
// is left that way.
// Not only that, any user-written-line containing multiple JSX siblings
// should also be kept on one line if possible,
// so each user-written-line is wrapped in its own group.
//
// Elements that contain newlines or don't fit on a single line (recursively)
// are fully-split, using hardline and shouldBreak: true.
//
// To support that case properly, all leading and trailing spaces
// are stripped from the list of children, and replaced with a single hardline.
function printJSXElement(path, options, print) {
  const n = path.getValue();

  if (n.type === "JSXElement" && isEmptyJSXElement(n)) {
    return concat([
      path.call(print, "openingElement"),
      path.call(print, "closingElement")
    ]);
  }

  const openingLines =
    n.type === "JSXElement"
      ? path.call(print, "openingElement")
      : path.call(print, "openingFragment");
  const closingLines =
    n.type === "JSXElement"
      ? path.call(print, "closingElement")
      : path.call(print, "closingFragment");

  if (
    n.children.length === 1 &&
    n.children[0].type === "JSXExpressionContainer" &&
    (n.children[0].expression.type === "TemplateLiteral" ||
      n.children[0].expression.type === "TaggedTemplateExpression")
  ) {
    return concat([
      openingLines,
      concat(path.map(print, "children")),
      closingLines
    ]);
  }

  // Convert `{" "}` to text nodes containing a space.
  // This makes it easy to turn them into `jsxWhitespace` which
  // can then print as either a space or `{" "}` when breaking.
  n.children = n.children.map(child => {
    if (isJSXWhitespaceExpression(child)) {
      return {
        type: "JSXText",
        value: " ",
        raw: " "
      };
    }
    return child;
  });

  const containsTag = n.children.filter(isJSXNode).length > 0;
  const containsMultipleExpressions =
    n.children.filter(child => child.type === "JSXExpressionContainer").length >
    1;
  const containsMultipleAttributes =
    n.type === "JSXElement" && n.openingElement.attributes.length > 1;

  // Record any breaks. Should never go from true to false, only false to true.
  let forcedBreak =
    willBreak(openingLines) ||
    containsTag ||
    containsMultipleAttributes ||
    containsMultipleExpressions;

  const rawJsxWhitespace = options.singleQuote ? "{' '}" : '{" "}';
  const jsxWhitespace = ifBreak(concat([rawJsxWhitespace, softline]), " ");

  const isFacebookTranslationTag =
    n.openingElement &&
    n.openingElement.name &&
    n.openingElement.name.name === "fbt";

  const children = printJSXChildren(
    path,
    options,
    print,
    jsxWhitespace,
    isFacebookTranslationTag
  );

  const containsText =
    n.children.filter(child => isMeaningfulJSXText(child)).length > 0;

  // We can end up we multiple whitespace elements with empty string
  // content between them.
  // We need to remove empty whitespace and softlines before JSX whitespace
  // to get the correct output.
  for (let i = children.length - 2; i >= 0; i--) {
    const isPairOfEmptyStrings = children[i] === "" && children[i + 1] === "";
    const isPairOfHardlines =
      children[i] === hardline &&
      children[i + 1] === "" &&
      children[i + 2] === hardline;
    const isLineFollowedByJSXWhitespace =
      (children[i] === softline || children[i] === hardline) &&
      children[i + 1] === "" &&
      children[i + 2] === jsxWhitespace;
    const isJSXWhitespaceFollowedByLine =
      children[i] === jsxWhitespace &&
      children[i + 1] === "" &&
      (children[i + 2] === softline || children[i + 2] === hardline);
    const isDoubleJSXWhitespace =
      children[i] === jsxWhitespace &&
      children[i + 1] === "" &&
      children[i + 2] === jsxWhitespace;
    const isPairOfHardOrSoftLines =
      (children[i] === softline &&
        children[i + 1] === "" &&
        children[i + 2] === hardline) ||
      (children[i] === hardline &&
        children[i + 1] === "" &&
        children[i + 2] === softline);

    if (
      (isPairOfHardlines && containsText) ||
      isPairOfEmptyStrings ||
      isLineFollowedByJSXWhitespace ||
      isDoubleJSXWhitespace ||
      isPairOfHardOrSoftLines
    ) {
      children.splice(i, 2);
    } else if (isJSXWhitespaceFollowedByLine) {
      children.splice(i + 1, 2);
    }
  }

  // Trim trailing lines (or empty strings)
  while (
    children.length &&
    (isLineNext(getLast(children)) || isEmpty(getLast(children)))
  ) {
    children.pop();
  }

  // Trim leading lines (or empty strings)
  while (
    children.length &&
    (isLineNext(children[0]) || isEmpty(children[0])) &&
    (isLineNext(children[1]) || isEmpty(children[1]))
  ) {
    children.shift();
    children.shift();
  }

  // Tweak how we format children if outputting this element over multiple lines.
  // Also detect whether we will force this element to output over multiple lines.
  const multilineChildren = [];
  children.forEach((child, i) => {
    // There are a number of situations where we need to ensure we display
    // whitespace as `{" "}` when outputting this element over multiple lines.
    if (child === jsxWhitespace) {
      if (i === 1 && children[i - 1] === "") {
        if (children.length === 2) {
          // Solitary whitespace
          multilineChildren.push(rawJsxWhitespace);
          return;
        }
        // Leading whitespace
        multilineChildren.push(concat([rawJsxWhitespace, hardline]));
        return;
      } else if (i === children.length - 1) {
        // Trailing whitespace
        multilineChildren.push(rawJsxWhitespace);
        return;
      } else if (children[i - 1] === "" && children[i - 2] === hardline) {
        // Whitespace after line break
        multilineChildren.push(rawJsxWhitespace);
        return;
      }
    }

    multilineChildren.push(child);

    if (willBreak(child)) {
      forcedBreak = true;
    }
  });

  // If there is text we use `fill` to fit as much onto each line as possible.
  // When there is no text (just tags and expressions) we use `group`
  // to output each on a separate line.
  const content = containsText
    ? fill(multilineChildren)
    : group(concat(multilineChildren), { shouldBreak: true });

  const multiLineElem = group(
    concat([
      openingLines,
      indent(concat([hardline, content])),
      hardline,
      closingLines
    ])
  );

  if (forcedBreak) {
    return multiLineElem;
  }

  return conditionalGroup([
    group(concat([openingLines, concat(children), closingLines])),
    multiLineElem
  ]);
}

function maybeWrapJSXElementInParens(path, elem, options) {
  const parent = path.getParentNode();
  if (!parent) {
    return elem;
  }

  const NO_WRAP_PARENTS = {
    ArrayExpression: true,
    JSXAttribute: true,
    JSXElement: true,
    JSXExpressionContainer: true,
    JSXFragment: true,
    ExpressionStatement: true,
    CallExpression: true,
    OptionalCallExpression: true,
    ConditionalExpression: true,
    JsExpressionRoot: true
  };
  if (NO_WRAP_PARENTS[parent.type]) {
    return elem;
  }

  const shouldBreak =
    matchAncestorTypes(path, [
      "ArrowFunctionExpression",
      "CallExpression",
      "JSXExpressionContainer"
    ]) ||
    matchAncestorTypes(path, [
      "ArrowFunctionExpression",
      "OptionalCallExpression",
      "JSXExpressionContainer"
    ]);

  const needsParens = pathNeedsParens(path, options);

  return group(
    concat([
      needsParens ? "" : ifBreak("("),
      indent(concat([softline, elem])),
      softline,
      needsParens ? "" : ifBreak(")")
    ]),
    { shouldBreak }
  );
}

function shouldInlineLogicalExpression(node) {
  if (node.type !== "LogicalExpression") {
    return false;
  }

  if (
    node.right.type === "ObjectExpression" &&
    node.right.properties.length !== 0
  ) {
    return true;
  }

  if (
    node.right.type === "ArrayExpression" &&
    node.right.elements.length !== 0
  ) {
    return true;
  }

  if (isJSXNode(node.right)) {
    return true;
  }

  return false;
}

// For binary expressions to be consistent, we need to group
// subsequent operators with the same precedence level under a single
// group. Otherwise they will be nested such that some of them break
// onto new lines but not all. Operators with the same precedence
// level should either all break or not. Because we group them by
// precedence level and the AST is structured based on precedence
// level, things are naturally broken up correctly, i.e. `&&` is
// broken before `+`.
function printBinaryishExpressions(
  path,
  print,
  options,
  isNested,
  isInsideParenthesis
) {
  let parts = [];
  const node = path.getValue();

  // We treat BinaryExpression and LogicalExpression nodes the same.
  if (isBinaryish(node)) {
    // Put all operators with the same precedence level in the same
    // group. The reason we only need to do this with the `left`
    // expression is because given an expression like `1 + 2 - 3`, it
    // is always parsed like `((1 + 2) - 3)`, meaning the `left` side
    // is where the rest of the expression will exist. Binary
    // expressions on the right side mean they have a difference
    // precedence level and should be treated as a separate group, so
    // print them normally. (This doesn't hold for the `**` operator,
    // which is unique in that it is right-associative.)
    if (shouldFlatten(node.operator, node.left.operator)) {
      // Flatten them out by recursively calling this function.
      parts = parts.concat(
        path.call(
          left =>
            printBinaryishExpressions(
              left,
              print,
              options,
              /* isNested */ true,
              isInsideParenthesis
            ),
          "left"
        )
      );
    } else {
      parts.push(path.call(print, "left"));
    }

    const shouldInline = shouldInlineLogicalExpression(node);
    const lineBeforeOperator =
      (node.operator === "|>" ||
        node.type === "NGPipeExpression" ||
        (node.operator === "|" && options.parser === "__vue_expression")) &&
      !hasLeadingOwnLineComment(options.originalText, node.right, options);

    const operator = node.type === "NGPipeExpression" ? "|" : node.operator;
    const rightSuffix =
      node.type === "NGPipeExpression" && node.arguments.length !== 0
        ? group(
            indent(
              concat([
                softline,
                ": ",
                join(
                  concat([softline, ":", ifBreak(" ")]),
                  path.map(print, "arguments").map(arg => align(2, group(arg)))
                )
              ])
            )
          )
        : "";

    const right = shouldInline
      ? concat([operator, " ", path.call(print, "right"), rightSuffix])
      : concat([
          lineBeforeOperator ? softline : "",
          operator,
          lineBeforeOperator ? " " : line,
          path.call(print, "right"),
          rightSuffix
        ]);

    // If there's only a single binary expression, we want to create a group
    // in order to avoid having a small right part like -1 be on its own line.
    const parent = path.getParentNode();
    const shouldGroup =
      !(isInsideParenthesis && node.type === "LogicalExpression") &&
      parent.type !== node.type &&
      node.left.type !== node.type &&
      node.right.type !== node.type;

    parts.push(" ", shouldGroup ? group(right) : right);

    // The root comments are already printed, but we need to manually print
    // the other ones since we don't call the normal print on BinaryExpression,
    // only for the left and right parts
    if (isNested && node.comments) {
      parts = comments.printComments(path, () => concat(parts), options);
    }
  } else {
    // Our stopping case. Simply print the node normally.
    parts.push(path.call(print));
  }

  return parts;
}

function printAssignmentRight(leftNode, rightNode, printedRight, options) {
  if (hasLeadingOwnLineComment(options.originalText, rightNode, options)) {
    return indent(concat([hardline, printedRight]));
  }

  const canBreak =
    (isBinaryish(rightNode) && !shouldInlineLogicalExpression(rightNode)) ||
    (rightNode.type === "ConditionalExpression" &&
      isBinaryish(rightNode.test) &&
      !shouldInlineLogicalExpression(rightNode.test)) ||
    rightNode.type === "StringLiteralTypeAnnotation" ||
    (rightNode.type === "ClassExpression" &&
      rightNode.decorators &&
      rightNode.decorators.length) ||
    ((leftNode.type === "Identifier" ||
      isStringLiteral(leftNode) ||
      leftNode.type === "MemberExpression") &&
      (isStringLiteral(rightNode) || isMemberExpressionChain(rightNode)) &&
      // do not put values on a separate line from the key in json
      options.parser !== "json" &&
      options.parser !== "json5") ||
    rightNode.type === "SequenceExpression";

  if (canBreak) {
    return group(indent(concat([line, printedRight])));
  }

  return concat([" ", printedRight]);
}

function printAssignment(
  leftNode,
  printedLeft,
  operator,
  rightNode,
  printedRight,
  options
) {
  if (!rightNode) {
    return printedLeft;
  }

  const printed = printAssignmentRight(
    leftNode,
    rightNode,
    printedRight,
    options
  );

  return group(concat([printedLeft, operator, printed]));
}

function adjustClause(node, clause, forceSpace) {
  if (node.type === "EmptyStatement") {
    return ";";
  }

  if (node.type === "BlockStatement" || forceSpace) {
    return concat([" ", clause]);
  }

  return indent(concat([line, clause]));
}

function nodeStr(node, options, isFlowOrTypeScriptDirectiveLiteral) {
  const raw = rawText(node);
  const isDirectiveLiteral =
    isFlowOrTypeScriptDirectiveLiteral || node.type === "DirectiveLiteral";
  return printString(raw, options, isDirectiveLiteral);
}

function printRegex(node) {
  const flags = node.flags
    .split("")
    .sort()
    .join("");
  return `/${node.pattern}/${flags}`;
}

function exprNeedsASIProtection(path, options) {
  const node = path.getValue();

  const maybeASIProblem =
    pathNeedsParens(path, options) ||
    node.type === "ParenthesizedExpression" ||
    node.type === "TypeCastExpression" ||
    (node.type === "ArrowFunctionExpression" &&
      !shouldPrintParamsWithoutParens(path, options)) ||
    node.type === "ArrayExpression" ||
    node.type === "ArrayPattern" ||
    (node.type === "UnaryExpression" &&
      node.prefix &&
      (node.operator === "+" || node.operator === "-")) ||
    node.type === "TemplateLiteral" ||
    node.type === "TemplateElement" ||
    isJSXNode(node) ||
    (node.type === "BindExpression" && !node.object) ||
    node.type === "RegExpLiteral" ||
    (node.type === "Literal" && node.pattern) ||
    (node.type === "Literal" && node.regex);

  if (maybeASIProblem) {
    return true;
  }

  if (!hasNakedLeftSide(node)) {
    return false;
  }

  return path.call.apply(
    path,
    [childPath => exprNeedsASIProtection(childPath, options)].concat(
      getLeftSidePathName(path, node)
    )
  );
}

function stmtNeedsASIProtection(path, options) {
  const node = path.getNode();

  if (node.type !== "ExpressionStatement") {
    return false;
  }

  return path.call(
    childPath => exprNeedsASIProtection(childPath, options),
    "expression"
  );
}

function shouldHugType(node) {
  if (isSimpleFlowType(node) || isObjectType(node)) {
    return true;
  }

  if (node.type === "UnionTypeAnnotation" || node.type === "TSUnionType") {
    const voidCount = node.types.filter(
      n =>
        n.type === "VoidTypeAnnotation" ||
        n.type === "TSVoidKeyword" ||
        n.type === "NullLiteralTypeAnnotation" ||
        n.type === "TSNullKeyword"
    ).length;

    const objectCount = node.types.filter(
      n =>
        n.type === "ObjectTypeAnnotation" ||
        n.type === "TSTypeLiteral" ||
        // This is a bit aggressive but captures Array<{x}>
        n.type === "GenericTypeAnnotation" ||
        n.type === "TSTypeReference"
    ).length;

    if (node.types.length - 1 === voidCount && objectCount > 0) {
      return true;
    }
  }

  return false;
}

function shouldHugArguments(fun) {
  return (
    fun &&
    fun.params &&
    fun.params.length === 1 &&
    !fun.params[0].comments &&
    (fun.params[0].type === "ObjectPattern" ||
      fun.params[0].type === "ArrayPattern" ||
      (fun.params[0].type === "Identifier" &&
        fun.params[0].typeAnnotation &&
        (fun.params[0].typeAnnotation.type === "TypeAnnotation" ||
          fun.params[0].typeAnnotation.type === "TSTypeAnnotation") &&
        isObjectType(fun.params[0].typeAnnotation.typeAnnotation)) ||
      (fun.params[0].type === "FunctionTypeParam" &&
        isObjectType(fun.params[0].typeAnnotation)) ||
      (fun.params[0].type === "AssignmentPattern" &&
        (fun.params[0].left.type === "ObjectPattern" ||
          fun.params[0].left.type === "ArrayPattern") &&
        (fun.params[0].right.type === "Identifier" ||
          (fun.params[0].right.type === "ObjectExpression" &&
            fun.params[0].right.properties.length === 0) ||
          (fun.params[0].right.type === "ArrayExpression" &&
            fun.params[0].right.elements.length === 0)))) &&
    !fun.rest
  );
}

function printArrayItems(path, options, printPath, print) {
  const printedElements = [];
  let separatorParts = [];

  path.each(childPath => {
    printedElements.push(concat(separatorParts));
    printedElements.push(group(print(childPath)));

    separatorParts = [",", line];
    if (
      childPath.getValue() &&
      isNextLineEmpty(options.originalText, childPath.getValue(), options)
    ) {
      separatorParts.push(softline);
    }
  }, printPath);

  return concat(printedElements);
}

function willPrintOwnComments(path /*, options */) {
  const node = path.getValue();
  const parent = path.getParentNode();

  return (
    ((node &&
      (isJSXNode(node) ||
        hasFlowShorthandAnnotationComment(node) ||
        (parent &&
          (parent.type === "CallExpression" ||
            parent.type === "OptionalCallExpression") &&
          (hasFlowAnnotationComment(node.leadingComments) ||
            hasFlowAnnotationComment(node.trailingComments))))) ||
      (parent &&
        (parent.type === "JSXSpreadAttribute" ||
          parent.type === "JSXSpreadChild" ||
          parent.type === "UnionTypeAnnotation" ||
          parent.type === "TSUnionType" ||
          ((parent.type === "ClassDeclaration" ||
            parent.type === "ClassExpression") &&
            parent.superClass === node)))) &&
    !hasIgnoreComment(path)
  );
}

function canAttachComment(node) {
  return (
    node.type &&
    node.type !== "CommentBlock" &&
    node.type !== "CommentLine" &&
    node.type !== "Line" &&
    node.type !== "Block" &&
    node.type !== "EmptyStatement" &&
    node.type !== "TemplateElement" &&
    node.type !== "Import"
  );
}

function printComment(commentPath, options) {
  const comment = commentPath.getValue();

  switch (comment.type) {
    case "CommentBlock":
    case "Block": {
      if (isIndentableBlockComment(comment)) {
        const printed = printIndentableBlockComment(comment);
        // We need to prevent an edge case of a previous trailing comment
        // printed as a `lineSuffix` which causes the comments to be
        // interleaved. See https://github.com/prettier/prettier/issues/4412
        if (
          comment.trailing &&
          !hasNewline(options.originalText, options.locStart(comment), {
            backwards: true
          })
        ) {
          return concat([hardline, printed]);
        }
        return printed;
      }

      const isInsideFlowComment =
        options.originalText.substr(options.locEnd(comment) - 3, 3) === "*-/";

      return "/*" + comment.value + (isInsideFlowComment ? "*-/" : "*/");
    }
    case "CommentLine":
    case "Line":
      // Print shebangs with the proper comment characters
      if (
        options.originalText.slice(options.locStart(comment)).startsWith("#!")
      ) {
        return "#!" + comment.value.trimRight();
      }
      return "//" + comment.value.trimRight();
    default:
      throw new Error("Not a comment: " + JSON.stringify(comment));
  }
}

function isIndentableBlockComment(comment) {
  // If the comment has multiple lines and every line starts with a star
  // we can fix the indentation of each line. The stars in the `/*` and
  // `*/` delimiters are not included in the comment value, so add them
  // back first.
  const lines = `*${comment.value}*`.split("\n");
  return lines.length > 1 && lines.every(line => line.trim()[0] === "*");
}

function printIndentableBlockComment(comment) {
  const lines = comment.value.split("\n");

  return concat([
    "/*",
    join(
      hardline,
      lines.map((line, index) =>
        index === 0
          ? line.trimRight()
          : " " + (index < lines.length - 1 ? line.trim() : line.trimLeft())
      )
    ),
    "*/"
  ]);
}

module.exports = {
  preprocess,
  print: genericPrint,
  embed,
  insertPragma,
  massageAstNode: clean,
  hasPrettierIgnore,
  willPrintOwnComments,
  canAttachComment,
  printComment,
  isBlockComment: handleComments.isBlockComment,
  handleComments: {
    ownLine: handleComments.handleOwnLineComment,
    endOfLine: handleComments.handleEndOfLineComment,
    remaining: handleComments.handleRemainingComment
  }
};
