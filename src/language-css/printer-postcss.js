"use strict";

const clean = require("./clean");
const embed = require("./embed");
const { insertPragma } = require("./pragma");
const {
  printNumber,
  printString,
  hasIgnoreComment,
  hasNewline
} = require("../common/util");
const { isNextLineEmpty } = require("../common/util-shared");

const {
  builders: {
    concat,
    join,
    line,
    hardline,
    softline,
    group,
    fill,
    indent,
    dedent,
    ifBreak
  },
  utils: { removeLines }
} = require("../doc");

const {
  getAncestorNode,
  getPropOfDeclNode,
  maybeToLowerCase,
  insideValueFunctionNode,
  insideICSSRuleNode,
  insideAtRuleNode,
  insideURLFunctionInImportAtRuleNode,
  isKeyframeAtRuleKeywords,
  isHTMLTag,
  isWideKeywords,
  isSCSS,
  isLastNode,
  isSCSSControlDirectiveNode,
  isDetachedRulesetDeclarationNode,
  isRelationalOperatorNode,
  isEqualityOperatorNode,
  isMultiplicationNode,
  isDivisionNode,
  isAdditionNode,
  isSubtractionNode,
  isMathOperatorNode,
  isEachKeywordNode,
  isForKeywordNode,
  isURLFunctionNode,
  isIfElseKeywordNode,
  hasComposesNode,
  hasParensAroundNode,
  hasEmptyRawBefore,
  isKeyValuePairNode,
  isDetachedRulesetCallNode,
  isTemplatePlaceholderNode,
  isTemplatePropNode,
  isPostcssSimpleVarNode,
  isSCSSMapItemNode,
  isInlineValueCommentNode,
  isHashNode,
  isLeftCurlyBraceNode,
  isRightCurlyBraceNode,
  isWordNode,
  isColonNode,
  isMediaAndSupportsKeywords,
  isColorAdjusterFuncNode
} = require("./utils");

function shouldPrintComma(options) {
  switch (options.trailingComma) {
    case "all":
    case "es5":
      return true;
    case "none":
    default:
      return false;
  }
}

function genericPrint(path, options, print) {
  const node = path.getValue();

  /* istanbul ignore if */
  if (!node) {
    return "";
  }

  if (typeof node === "string") {
    return node;
  }

  switch (node.type) {
    case "yaml":
    case "toml":
      return concat([node.raw, hardline]);
    case "css-root": {
      const nodes = printNodeSequence(path, options, print);

      if (nodes.parts.length) {
        return concat([nodes, hardline]);
      }

      return nodes;
    }
    case "css-comment": {
      if (node.raws.content) {
        return node.raws.content;
      }
      const text = options.originalText.slice(
        options.locStart(node),
        options.locEnd(node)
      );
      const rawText = node.raws.text || node.text;
      // Workaround a bug where the location is off.
      // https://github.com/postcss/postcss-scss/issues/63
      if (text.indexOf(rawText) === -1) {
        if (node.raws.inline) {
          return concat(["// ", rawText]);
        }
        return concat(["/* ", rawText, " */"]);
      }
      return text;
    }
    case "css-rule": {
      return concat([
        path.call(print, "selector"),
        node.important ? " !important" : "",
        node.nodes
          ? concat([
              " {",
              node.nodes.length > 0
                ? indent(
                    concat([hardline, printNodeSequence(path, options, print)])
                  )
                : "",
              hardline,
              "}",
              isDetachedRulesetDeclarationNode(node) ? ";" : ""
            ])
          : ";"
      ]);
    }
    case "css-decl": {
      const parentNode = path.getParentNode();

      return concat([
        node.raws.before.replace(/[\s;]/g, ""),
        insideICSSRuleNode(path) ? node.prop : maybeToLowerCase(node.prop),
        node.raws.between.trim() === ":" ? ":" : node.raws.between.trim(),
        node.extend ? "" : " ",
        hasComposesNode(node)
          ? removeLines(path.call(print, "value"))
          : path.call(print, "value"),
        node.raws.important
          ? node.raws.important.replace(/\s*!\s*important/i, " !important")
          : node.important
          ? " !important"
          : "",
        node.raws.scssDefault
          ? node.raws.scssDefault.replace(/\s*!default/i, " !default")
          : node.scssDefault
          ? " !default"
          : "",
        node.raws.scssGlobal
          ? node.raws.scssGlobal.replace(/\s*!global/i, " !global")
          : node.scssGlobal
          ? " !global"
          : "",
        node.nodes
          ? concat([
              " {",
              indent(
                concat([softline, printNodeSequence(path, options, print)])
              ),
              softline,
              "}"
            ])
          : isTemplatePropNode(node) &&
            !parentNode.raws.semicolon &&
            options.originalText[options.locEnd(node) - 1] !== ";"
          ? ""
          : ";"
      ]);
    }
    case "css-atrule": {
      const parentNode = path.getParentNode();

      return concat([
        "@",
        // If a Less file ends up being parsed with the SCSS parser, Less
        // variable declarations will be parsed as at-rules with names ending
        // with a colon, so keep the original case then.
        isDetachedRulesetCallNode(node) || node.name.endsWith(":")
          ? node.name
          : maybeToLowerCase(node.name),
        node.params
          ? concat([
              isDetachedRulesetCallNode(node)
                ? ""
                : isTemplatePlaceholderNode(node) &&
                  /^\s*\n/.test(node.raws.afterName)
                ? /^\s*\n\s*\n/.test(node.raws.afterName)
                  ? concat([hardline, hardline])
                  : hardline
                : " ",
              path.call(print, "params")
            ])
          : "",
        node.selector
          ? indent(concat([" ", path.call(print, "selector")]))
          : "",
        node.value
          ? group(
              concat([
                " ",
                path.call(print, "value"),
                isSCSSControlDirectiveNode(node)
                  ? hasParensAroundNode(node)
                    ? " "
                    : line
                  : ""
              ])
            )
          : node.name === "else"
          ? " "
          : "",
        node.nodes
          ? concat([
              isSCSSControlDirectiveNode(node) ? "" : " ",
              "{",
              indent(
                concat([
                  node.nodes.length > 0 ? softline : "",
                  printNodeSequence(path, options, print)
                ])
              ),
              softline,
              "}"
            ])
          : isTemplatePlaceholderNode(node) &&
            !parentNode.raws.semicolon &&
            options.originalText[options.locEnd(node) - 1] !== ";"
          ? ""
          : ";"
      ]);
    }
    // postcss-media-query-parser
    case "media-query-list": {
      const parts = [];
      path.each(childPath => {
        const node = childPath.getValue();
        if (node.type === "media-query" && node.value === "") {
          return;
        }
        parts.push(childPath.call(print));
      }, "nodes");

      return group(indent(join(line, parts)));
    }
    case "media-query": {
      return concat([
        join(" ", path.map(print, "nodes")),
        isLastNode(path, node) ? "" : ","
      ]);
    }
    case "media-type": {
      return adjustNumbers(adjustStrings(node.value, options));
    }
    case "media-feature-expression": {
      if (!node.nodes) {
        return node.value;
      }
      return concat(["(", concat(path.map(print, "nodes")), ")"]);
    }
    case "media-feature": {
      return maybeToLowerCase(
        adjustStrings(node.value.replace(/ +/g, " "), options)
      );
    }
    case "media-colon": {
      return concat([node.value, " "]);
    }
    case "media-value": {
      return adjustNumbers(adjustStrings(node.value, options));
    }
    case "media-keyword": {
      return adjustStrings(node.value, options);
    }
    case "media-url": {
      return adjustStrings(
        node.value.replace(/^url\(\s+/gi, "url(").replace(/\s+\)$/gi, ")"),
        options
      );
    }
    case "media-unknown": {
      return node.value;
    }
    // postcss-selector-parser
    case "selector-root": {
      return group(
        concat([
          insideAtRuleNode(path, "custom-selector")
            ? concat([getAncestorNode(path, "css-atrule").customSelector, line])
            : "",
          join(
            concat([
              ",",
              insideAtRuleNode(path, ["extend", "custom-selector", "nest"])
                ? line
                : hardline
            ]),
            path.map(print, "nodes")
          )
        ])
      );
    }
    case "selector-selector": {
      return group(indent(concat(path.map(print, "nodes"))));
    }
    case "selector-comment": {
      return node.value;
    }
    case "selector-string": {
      return adjustStrings(node.value, options);
    }
    case "selector-tag": {
      const parentNode = path.getParentNode();
      const index = parentNode && parentNode.nodes.indexOf(node);
      const prevNode = index && parentNode.nodes[index - 1];

      return concat([
        node.namespace
          ? concat([node.namespace === true ? "" : node.namespace.trim(), "|"])
          : "",
        prevNode.type === "selector-nesting"
          ? node.value
          : adjustNumbers(
              isHTMLTag(node.value) ||
                isKeyframeAtRuleKeywords(path, node.value)
                ? node.value.toLowerCase()
                : node.value
            )
      ]);
    }
    case "selector-id": {
      return concat(["#", node.value]);
    }
    case "selector-class": {
      return concat([".", adjustNumbers(adjustStrings(node.value, options))]);
    }
    case "selector-attribute": {
      return concat([
        "[",
        node.namespace
          ? concat([node.namespace === true ? "" : node.namespace.trim(), "|"])
          : "",
        node.attribute.trim(),
        node.operator ? node.operator : "",
        node.value
          ? quoteAttributeValue(
              adjustStrings(node.value.trim(), options),
              options
            )
          : "",
        node.insensitive ? " i" : "",
        "]"
      ]);
    }
    case "selector-combinator": {
      if (
        node.value === "+" ||
        node.value === ">" ||
        node.value === "~" ||
        node.value === ">>>"
      ) {
        const parentNode = path.getParentNode();
        const leading =
          parentNode.type === "selector-selector" &&
          parentNode.nodes[0] === node
            ? ""
            : line;

        return concat([leading, node.value, isLastNode(path, node) ? "" : " "]);
      }

      const leading = node.value.trim().startsWith("(") ? line : "";
      const value =
        adjustNumbers(adjustStrings(node.value.trim(), options)) || line;

      return concat([leading, value]);
    }
    case "selector-universal": {
      return concat([
        node.namespace
          ? concat([node.namespace === true ? "" : node.namespace.trim(), "|"])
          : "",
        node.value
      ]);
    }
    case "selector-pseudo": {
      return concat([
        maybeToLowerCase(node.value),
        node.nodes && node.nodes.length > 0
          ? concat(["(", join(", ", path.map(print, "nodes")), ")"])
          : ""
      ]);
    }
    case "selector-nesting": {
      return node.value;
    }
    case "selector-unknown": {
      const ruleAncestorNode = getAncestorNode(path, "css-rule");

      // Nested SCSS property
      if (ruleAncestorNode && ruleAncestorNode.isSCSSNesterProperty) {
        return adjustNumbers(
          adjustStrings(maybeToLowerCase(node.value), options)
        );
      }

      return node.value;
    }
    // postcss-values-parser
    case "value-value":
    case "value-root": {
      return path.call(print, "group");
    }
    case "value-comment": {
      return concat([
        node.inline ? "//" : "/*",
        node.value,
        node.inline ? "" : "*/"
      ]);
    }
    case "value-comma_group": {
      const parentNode = path.getParentNode();
      const parentParentNode = path.getParentNode(1);
      const declAncestorProp = getPropOfDeclNode(path);
      const isGridValue =
        declAncestorProp &&
        parentNode.type === "value-value" &&
        (declAncestorProp === "grid" ||
          declAncestorProp.startsWith("grid-template"));
      const atRuleAncestorNode = getAncestorNode(path, "css-atrule");
      const isControlDirective =
        atRuleAncestorNode && isSCSSControlDirectiveNode(atRuleAncestorNode);

      const printed = path.map(print, "groups");
      const parts = [];
      const insideURLFunction = insideValueFunctionNode(path, "url");

      let insideSCSSInterpolationInString = false;
      let didBreak = false;
      for (let i = 0; i < node.groups.length; ++i) {
        parts.push(printed[i]);

        // Ignore value inside `url()`
        if (insideURLFunction) {
          continue;
        }

        const iPrevNode = node.groups[i - 1];
        const iNode = node.groups[i];
        const iNextNode = node.groups[i + 1];
        const iNextNextNode = node.groups[i + 2];

        // Ignore after latest node (i.e. before semicolon)
        if (!iNextNode) {
          continue;
        }

        // Ignore spaces before/after string interpolation (i.e. `"#{my-fn("_")}"`)
        const isStartSCSSinterpolationInString =
          iNode.type === "value-string" && iNode.value.startsWith("#{");
        const isEndingSCSSinterpolationInString =
          insideSCSSInterpolationInString &&
          iNextNode.type === "value-string" &&
          iNextNode.value.endsWith("}");

        if (
          isStartSCSSinterpolationInString ||
          isEndingSCSSinterpolationInString
        ) {
          insideSCSSInterpolationInString = !insideSCSSInterpolationInString;

          continue;
        }

        if (insideSCSSInterpolationInString) {
          continue;
        }

        // Ignore colon (i.e. `:`)
        if (isColonNode(iNode) || isColonNode(iNextNode)) {
          continue;
        }

        // Ignore `@` in Less (i.e. `@@var;`)
        if (iNode.type === "value-atword" && iNode.value === "") {
          continue;
        }

        // Ignore `~` in Less (i.e. `content: ~"^//* some horrible but needed css hack";`)
        if (iNode.value === "~") {
          continue;
        }

        // Ignore escape `\`
        if (
          iNode.value &&
          iNode.value.indexOf("\\") !== -1 &&
          iNextNode &&
          iNextNode.type !== "value-comment"
        ) {
          continue;
        }

        // Ignore escaped `/`
        if (
          iPrevNode &&
          iPrevNode.value &&
          iPrevNode.value.indexOf("\\") === iPrevNode.value.length - 1 &&
          iNode.type === "value-operator" &&
          iNode.value === "/"
        ) {
          continue;
        }

        // Ignore `\` (i.e. `$variable: \@small;`)
        if (iNode.value === "\\") {
          continue;
        }

        // Ignore `$$` (i.e. `background-color: $$(style)Color;`)
        if (isPostcssSimpleVarNode(iNode, iNextNode)) {
          continue;
        }

        // Ignore spaces after `#` and after `{` and before `}` in SCSS interpolation (i.e. `#{variable}`)
        if (
          isHashNode(iNode) ||
          isLeftCurlyBraceNode(iNode) ||
          isRightCurlyBraceNode(iNextNode) ||
          (isLeftCurlyBraceNode(iNextNode) && hasEmptyRawBefore(iNextNode)) ||
          (isRightCurlyBraceNode(iNode) && hasEmptyRawBefore(iNextNode))
        ) {
          continue;
        }

        // Ignore css variables and interpolation in SCSS (i.e. `--#{$var}`)
        if (iNode.value === "--" && isHashNode(iNextNode)) {
          continue;
        }

        // Formatting math operations
        const isMathOperator = isMathOperatorNode(iNode);
        const isNextMathOperator = isMathOperatorNode(iNextNode);

        // Print spaces before and after math operators beside SCSS interpolation as is
        // (i.e. `#{$var}+5`, `#{$var} +5`, `#{$var}+ 5`, `#{$var} + 5`)
        // (i.e. `5+#{$var}`, `5 +#{$var}`, `5+ #{$var}`, `5 + #{$var}`)
        if (
          ((isMathOperator && isHashNode(iNextNode)) ||
            (isNextMathOperator && isRightCurlyBraceNode(iNode))) &&
          hasEmptyRawBefore(iNextNode)
        ) {
          continue;
        }

        // Print spaces before and after addition and subtraction math operators as is in `calc` function
        // due to the fact that it is not valid syntax
        // (i.e. `calc(1px+1px)`, `calc(1px+ 1px)`, `calc(1px +1px)`, `calc(1px + 1px)`)
        if (
          insideValueFunctionNode(path, "calc") &&
          (isAdditionNode(iNode) ||
            isAdditionNode(iNextNode) ||
            isSubtractionNode(iNode) ||
            isSubtractionNode(iNextNode)) &&
          hasEmptyRawBefore(iNextNode)
        ) {
          continue;
        }

        // Print spaces after `+` and `-` in color adjuster functions as is (e.g. `color(red l(+ 20%))`)
        // Adjusters with signed numbers (e.g. `color(red l(+20%))`) output as-is.
        const isColorAdjusterNode =
          (isAdditionNode(iNode) || isSubtractionNode(iNode)) &&
          i === 0 &&
          (iNextNode.type === "value-number" || iNextNode.isHex) &&
          (parentParentNode && isColorAdjusterFuncNode(parentParentNode)) &&
          !hasEmptyRawBefore(iNextNode);

        const requireSpaceBeforeOperator =
          (iNextNextNode && iNextNextNode.type === "value-func") ||
          (iNextNextNode && isWordNode(iNextNextNode)) ||
          iNode.type === "value-func" ||
          isWordNode(iNode);
        const requireSpaceAfterOperator =
          iNextNode.type === "value-func" ||
          isWordNode(iNextNode) ||
          (iPrevNode && iPrevNode.type === "value-func") ||
          (iPrevNode && isWordNode(iPrevNode));

        // Formatting `/`, `+`, `-` sign
        if (
          !(isMultiplicationNode(iNextNode) || isMultiplicationNode(iNode)) &&
          !insideValueFunctionNode(path, "calc") &&
          !isColorAdjusterNode &&
          ((isDivisionNode(iNextNode) && !requireSpaceBeforeOperator) ||
            (isDivisionNode(iNode) && !requireSpaceAfterOperator) ||
            (isAdditionNode(iNextNode) && !requireSpaceBeforeOperator) ||
            (isAdditionNode(iNode) && !requireSpaceAfterOperator) ||
            isSubtractionNode(iNextNode) ||
            isSubtractionNode(iNode)) &&
          (hasEmptyRawBefore(iNextNode) ||
            (isMathOperator &&
              (!iPrevNode || (iPrevNode && isMathOperatorNode(iPrevNode)))))
        ) {
          continue;
        }

        // Add `hardline` after inline comment (i.e. `// comment\n foo: bar;`)
        if (isInlineValueCommentNode(iNode)) {
          parts.push(hardline);
          continue;
        }

        // Handle keywords in SCSS control directive
        if (
          isControlDirective &&
          (isEqualityOperatorNode(iNextNode) ||
            isRelationalOperatorNode(iNextNode) ||
            isIfElseKeywordNode(iNextNode) ||
            isEachKeywordNode(iNode) ||
            isForKeywordNode(iNode))
        ) {
          parts.push(" ");

          continue;
        }

        // At-rule `namespace` should be in one line
        if (
          atRuleAncestorNode &&
          atRuleAncestorNode.name.toLowerCase() === "namespace"
        ) {
          parts.push(" ");

          continue;
        }

        // Formatting `grid` property
        if (isGridValue) {
          if (
            iNode.source &&
            iNextNode.source &&
            iNode.source.start.line !== iNextNode.source.start.line
          ) {
            parts.push(hardline);

            didBreak = true;
          } else {
            parts.push(" ");
          }

          continue;
        }

        // Add `space` before next math operation
        // Note: `grip` property have `/` delimiter and it is not math operation, so
        // `grid` property handles above
        if (isNextMathOperator) {
          parts.push(" ");

          continue;
        }

        // Be default all values go through `line`
        parts.push(line);
      }

      if (didBreak) {
        parts.unshift(hardline);
      }

      if (isControlDirective) {
        return group(indent(concat(parts)));
      }

      // Indent is not needed for import url when url is very long
      // and node has two groups
      // when type is value-comma_group
      // example @import url("verylongurl") projection,tv
      if (insideURLFunctionInImportAtRuleNode(path)) {
        return group(fill(parts));
      }

      return group(indent(fill(parts)));
    }
    case "value-paren_group": {
      const parentNode = path.getParentNode();

      if (
        parentNode &&
        isURLFunctionNode(parentNode) &&
        (node.groups.length === 1 ||
          (node.groups.length > 0 &&
            node.groups[0].type === "value-comma_group" &&
            node.groups[0].groups.length > 0 &&
            node.groups[0].groups[0].type === "value-word" &&
            node.groups[0].groups[0].value.startsWith("data:")))
      ) {
        return concat([
          node.open ? path.call(print, "open") : "",
          join(",", path.map(print, "groups")),
          node.close ? path.call(print, "close") : ""
        ]);
      }

      if (!node.open) {
        const printed = path.map(print, "groups");
        const res = [];

        for (let i = 0; i < printed.length; i++) {
          if (i !== 0) {
            res.push(concat([",", line]));
          }
          res.push(printed[i]);
        }

        return group(indent(fill(res)));
      }

      const isSCSSMapItem = isSCSSMapItemNode(path);

      return group(
        concat([
          node.open ? path.call(print, "open") : "",
          indent(
            concat([
              softline,
              join(
                concat([",", line]),
                path.map(childPath => {
                  const node = childPath.getValue();
                  const printed = print(childPath);

                  // Key/Value pair in open paren already indented
                  if (
                    isKeyValuePairNode(node) &&
                    node.type === "value-comma_group" &&
                    node.groups &&
                    node.groups[2] &&
                    node.groups[2].type === "value-paren_group"
                  ) {
                    printed.contents.contents.parts[1] = group(
                      printed.contents.contents.parts[1]
                    );

                    return group(dedent(printed));
                  }

                  return printed;
                }, "groups")
              )
            ])
          ),
          ifBreak(
            isSCSS(options.parser, options.originalText) &&
              isSCSSMapItem &&
              shouldPrintComma(options)
              ? ","
              : ""
          ),
          softline,
          node.close ? path.call(print, "close") : ""
        ]),
        {
          shouldBreak: isSCSSMapItem
        }
      );
    }
    case "value-func": {
      return concat([
        node.value,
        insideAtRuleNode(path, "supports") && isMediaAndSupportsKeywords(node)
          ? " "
          : "",
        path.call(print, "group")
      ]);
    }
    case "value-paren": {
      return node.value;
    }
    case "value-number": {
      return concat([printCssNumber(node.value), maybeToLowerCase(node.unit)]);
    }
    case "value-operator": {
      return node.value;
    }
    case "value-word": {
      if ((node.isColor && node.isHex) || isWideKeywords(node.value)) {
        return node.value.toLowerCase();
      }

      return node.value;
    }
    case "value-colon": {
      return concat([
        node.value,
        // Don't add spaces on `:` in `url` function (i.e. `url(fbglyph: cross-outline, fig-white)`)
        insideValueFunctionNode(path, "url") ? "" : line
      ]);
    }
    case "value-comma": {
      return concat([node.value, " "]);
    }
    case "value-string": {
      return printString(
        node.raws.quote + node.value + node.raws.quote,
        options
      );
    }
    case "value-atword": {
      return concat(["@", node.value]);
    }
    case "value-unicode-range": {
      return node.value;
    }
    case "value-unknown": {
      return node.value;
    }
    default:
      /* istanbul ignore next */
      throw new Error(`Unknown postcss type ${JSON.stringify(node.type)}`);
  }
}

function printNodeSequence(path, options, print) {
  const node = path.getValue();
  const parts = [];
  let i = 0;
  path.map(pathChild => {
    const prevNode = node.nodes[i - 1];
    if (
      prevNode &&
      prevNode.type === "css-comment" &&
      prevNode.text.trim() === "prettier-ignore"
    ) {
      const childNode = pathChild.getValue();
      parts.push(
        options.originalText.slice(
          options.locStart(childNode),
          options.locEnd(childNode)
        )
      );
    } else {
      parts.push(pathChild.call(print));
    }

    if (i !== node.nodes.length - 1) {
      if (
        (node.nodes[i + 1].type === "css-comment" &&
          !hasNewline(
            options.originalText,
            options.locStart(node.nodes[i + 1]),
            { backwards: true }
          ) &&
          node.nodes[i].type !== "yaml" &&
          node.nodes[i].type !== "toml") ||
        (node.nodes[i + 1].type === "css-atrule" &&
          node.nodes[i + 1].name === "else" &&
          node.nodes[i].type !== "css-comment")
      ) {
        parts.push(" ");
      } else {
        parts.push(hardline);
        if (
          isNextLineEmpty(
            options.originalText,
            pathChild.getValue(),
            options
          ) &&
          node.nodes[i].type !== "yaml" &&
          node.nodes[i].type !== "toml"
        ) {
          parts.push(hardline);
        }
      }
    }
    i++;
  }, "nodes");

  return concat(parts);
}

const STRING_REGEX = /(['"])(?:(?!\1)[^\\]|\\[\s\S])*\1/g;
const NUMBER_REGEX = /(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;
const STANDARD_UNIT_REGEX = /[a-zA-Z]+/g;
const WORD_PART_REGEX = /[$@]?[a-zA-Z_\u0080-\uFFFF][\w\-\u0080-\uFFFF]*/g;
const ADJUST_NUMBERS_REGEX = RegExp(
  STRING_REGEX.source +
    `|` +
    `(${WORD_PART_REGEX.source})?` +
    `(${NUMBER_REGEX.source})` +
    `(${STANDARD_UNIT_REGEX.source})?`,
  "g"
);

function adjustStrings(value, options) {
  return value.replace(STRING_REGEX, match => printString(match, options));
}

function quoteAttributeValue(value, options) {
  const quote = options.singleQuote ? "'" : '"';
  return value.includes('"') || value.includes("'")
    ? value
    : quote + value + quote;
}

function adjustNumbers(value) {
  return value.replace(
    ADJUST_NUMBERS_REGEX,
    (match, quote, wordPart, number, unit) =>
      !wordPart && number
        ? (wordPart || "") +
          printCssNumber(number) +
          maybeToLowerCase(unit || "")
        : match
  );
}

function printCssNumber(rawNumber) {
  return (
    printNumber(rawNumber)
      // Remove trailing `.0`.
      .replace(/\.0(?=$|e)/, "")
  );
}

module.exports = {
  print: genericPrint,
  embed,
  insertPragma,
  hasPrettierIgnore: hasIgnoreComment,
  massageAstNode: clean
};
