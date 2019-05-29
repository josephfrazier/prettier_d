"use strict";

const normalize = require("./options").normalize;
const comments = require("./comments");

function printSubtree(path, print, options, printAstToDoc) {
  if (options.printer.embed) {
    return options.printer.embed(
      path,
      print,
      (text, partialNextOptions) =>
        textToDoc(text, partialNextOptions, options, printAstToDoc),
      options
    );
  }
}

function textToDoc(text, partialNextOptions, parentOptions, printAstToDoc) {
  const nextOptions = normalize(
    Object.assign({}, parentOptions, partialNextOptions, {
      parentParser: parentOptions.parser,
      embeddedInHtml: !!(
        parentOptions.embeddedInHtml ||
        parentOptions.parser === "html" ||
        parentOptions.parser === "vue" ||
        parentOptions.parser === "angular" ||
        parentOptions.parser === "lwc"
      ),
      originalText: text
    }),
    { passThrough: true }
  );

  const result = require("./parser").parse(text, nextOptions);
  const ast = result.ast;
  text = result.text;

  const astComments = ast.comments;
  delete ast.comments;
  comments.attach(astComments, ast, text, nextOptions);
  return printAstToDoc(ast, nextOptions);
}

module.exports = {
  printSubtree
};
