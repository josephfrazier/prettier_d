"use strict";

const path = require("path");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const babelReplaceArrayIncludesWithIndexof = require.resolve(
  "./babel-plugins/replace-array-includes-with-indexof"
);

/**
 * @typedef {Object} Bundle
 * @property {string} input - input of the bundle
 * @property {string?} output - path of the output file in the `dist/` folder
 * @property {string?} name - name for the UMD bundle (for plugins, it'll be `prettierPlugins.${name}`)
 * @property {'node' | 'universal'} target - should generate a CJS only for node or UMD bundle
 * @property {'core' | 'plugin'} type - it's a plugin bundle or core part of prettier
 * @property {'rollup' | 'webpack'} [bundler='rollup'] - define which bundler to use
 * @property {CommonJSConfig} [commonjs={}] - options for `rollup-plugin-commonjs`
 * @property {string[]} externals - array of paths that should not be included in the final bundle
 * @property {Object.<string, string>} replace - map of strings to replace when processing the bundle
 * @property {string[]} babelPlugins - babel plugins
 * @property {Object?} terserOptions - options for `terser`

 * @typedef {Object} CommonJSConfig
 * @property {Object} namedExports - for cases where rollup can't infer what's exported
 * @property {string[]} ignore - paths of CJS modules to ignore
 */

/** @type {Bundle[]} */
const parsers = [
  {
    input: "src/language-js/parser-babylon.js",
    target: "universal",
    babelPlugins: [babelReplaceArrayIncludesWithIndexof]
  },
  {
    input: "src/language-js/parser-flow.js",
    target: "universal",
    strict: false
  },
  {
    input: "src/language-js/parser-typescript.js",
    target: "universal",
    babelPlugins: [babelReplaceArrayIncludesWithIndexof],
    commonjs: {
      ignore: [
        // Optional package for TypeScript that logs ETW events (a Windows-only technology).
        "@microsoft/typescript-etw"
      ]
    }
  },
  {
    input: "src/language-js/parser-angular.js",
    target: "universal",
    alias: {
      // Force using the CJS file, instead of ESM; i.e. get the file
      // from `"main"` instead of `"module"` (rollup default) of package.json
      entries: [
        {
          find: "lines-and-columns",
          replacement: require.resolve("lines-and-columns")
        },
        {
          find: "@angular/compiler/src",
          replacement: path.resolve(
            `${PROJECT_ROOT}/node_modules/@angular/compiler/esm2015/src`
          )
        }
      ]
    }
  },
  {
    input: "src/language-css/parser-postcss.js",
    target: "universal",
    // postcss has dependency cycles that don't work with rollup
    bundler: "webpack",
    terserOptions: {
      // prevent terser generate extra .LICENSE file
      extractComments: false,
      terserOptions: {
        mangle: {
          // postcss need keep_fnames when minify
          keep_fnames: true
        }
      }
    }
  },
  {
    input: "src/language-graphql/parser-graphql.js",
    target: "universal"
  },
  {
    input: "src/language-markdown/parser-markdown.js",
    target: "universal"
  },
  {
    input: "src/language-handlebars/parser-glimmer.js",
    target: "universal",
    alias: {
      entries: [
        // `handlebars` causes webpack warning by using `require.extensions`
        // `dist/handlebars.js` also complaint on `window` variable
        // use cjs build instead
        // https://github.com/prettier/prettier/issues/6656
        {
          find: "handlebars",
          replacement: require.resolve("handlebars/dist/cjs/handlebars.js")
        }
      ]
    },
    commonjs: {
      namedExports: {
        [require.resolve("handlebars/dist/cjs/handlebars.js")]: ["parse"],
        [require.resolve(
          "@glimmer/syntax/dist/modules/es2017/index.js"
        )]: "default"
      },
      ignore: ["source-map"]
    }
  },
  {
    input: "src/language-html/parser-html.js",
    target: "universal"
  },
  {
    input: "src/language-yaml/parser-yaml.js",
    target: "universal",
    alias: {
      // Force using the CJS file, instead of ESM; i.e. get the file
      // from `"main"` instead of `"module"` (rollup default) of package.json
      entries: [
        {
          find: "lines-and-columns",
          replacement: require.resolve("lines-and-columns")
        }
      ]
    },
    babelPlugins: [babelReplaceArrayIncludesWithIndexof]
  }
].map(parser => {
  const name = getFileOutput(parser)
    .replace(/\.js$/, "")
    .split("-")[1];
  return Object.assign(parser, { type: "plugin", name });
});

/** @type {Bundle[]} */
const coreBundles = [
  {
    input: "index.js",
    type: "core",
    target: "node",
    externals: [path.resolve("src/common/third-party.js")],
    replace: {
      // from @iarna/toml/parse-string
      "eval(\"require('util').inspect\")": "require('util').inspect"
    }
  },
  {
    input: "src/doc/index.js",
    name: "doc",
    type: "core",
    output: "doc.js",
    target: "universal"
  },
  {
    input: "standalone.js",
    name: "prettier",
    type: "core",
    target: "universal"
  },
  {
    input: "bin/prettier.js",
    type: "core",
    output: "bin-prettier.js",
    target: "node",
    externals: [path.resolve("src/common/third-party.js")]
  },
  {
    input: "src/common/third-party.js",
    type: "core",
    target: "node",
    replace: {
      // cosmiconfig@5 -> import-fresh uses `require` to resolve js config, which caused Error:
      // Dynamic requires are not currently supported by rollup-plugin-commonjs.
      "require(filePath)": "eval('require')(filePath)",
      "require.cache": "eval('require').cache"
    }
  }
];

function getFileOutput(bundle) {
  return bundle.output || path.basename(bundle.input);
}

module.exports = coreBundles
  .concat(parsers)
  .map(bundle => Object.assign(bundle, { output: getFileOutput(bundle) }));
