# No longer maintained, try https://github.com/mikew/prettier_d_slim instead ([context](https://github.com/josephfrazier/prettier_d/issues/83#issuecomment-815362919))

# prettier\_d

[![Build Status](https://travis-ci.org/josephfrazier/prettier_d.svg?branch=master)](https://travis-ci.org/josephfrazier/prettier_d)
[![SemVer]](http://semver.org)
[![License]](https://github.com/josephfrazier/prettier\_d.js/blob/master/LICENSE)

Makes [prettier] the fastest formatter on the planet.

Table of Contents
=================

* ["But prettier is pretty fast already, right?"](#but-prettier-is-pretty-fast-already-right)
* [Install](#install)
* [Usage](#usage)
* [How does this work?](#how-does-this-work)
* [Commands](#commands)
* [Editor integration](#editor-integration)
   * [Real-time formatting in Vim](#real-time-formatting-in-vim)

## "But prettier is pretty fast already, right?"

Yes, it's actually super fast. But the node.js startup time and loading all the
required modules slows down formatting times. `prettier_d` reduces this
overhead by running a server in the background. It brings the formatting time
down from `0.25` seconds to `0.1` seconds on a `3265` byte file
If you want to format from within your editor whenever you save a file, `prettier_d` is for you.

## Install

This will install the `prettier_d` command globally:

```bash
yarn global add https://github.com/josephfrazier/prettier_d
# or
npm install -g https://github.com/josephfrazier/prettier_d
```

## Usage

To start the server and format a file, just run:

```bash
prettier_d file.js
```

On the initial call, the `prettier_d` server is launched and then the given file
is formatted. Subsequent invocations are super fast.

## How does this work?

The first time you use `prettier_d`, a little server is started in the background
and bound to a random port. The port number is stored along with [a
token][change401] in the root directory of your repo (or `~/.prettier_d` if the repo root can't be found). You can then run `prettier_d` commands the
same way you would use `prettier` and it will delegate to the background server.

## Commands

Control the server like this:

```bash
prettier_d <command>
```

Available commands:

- `start`: start the server
- `stop`: stop the server
- `status`: print out whether the server is currently running
- `restart`: restart the server
- `[options] file.js` `file.js`: invoke `prettier` with the given options.
  The `prettier` engine will be created in the current directory. If the server
  is not yet running, it is started.

`prettier_d` will select a free port automatically and store the port number
along with an access token in the root directory of your repo (or `~/.prettier_d` if the repo root can't be found).

Type `prettier_d --help` to see the supported `prettier` options.

## Editor integration

See https://github.com/prettier/prettier#editor-integration

### Real-time formatting in Vim

[![asciicast](https://asciinema.org/a/bxk97niktazw18090o9thah06.png)](https://asciinema.org/a/bxk97niktazw18090o9thah06)

If you use Vim, and you'd like `prettier_d` to format your code as you type, install [Neoformat] and add this to your `~/.vimrc`:

```vim
autocmd FileType javascript setlocal formatprg=prettier_d\ --parser=babel
autocmd BufWritePre,TextChanged,InsertLeave *.js Neoformat

" Use formatprg when available
let g:neoformat_try_formatprg = 1
" https://github.com/sbdchd/neoformat/issues/25
let g:neoformat_only_msg_on_error = 1
```

Then, make sure you've started the server: `prettier_d start`.

This will format your code:

* before each save
* whenever text is changed in normal mode
* whenever you leave insert mode

[Neoformat]: https://github.com/sbdchd/neoformat
[SemVer]: http://img.shields.io/:semver-%E2%9C%93-brightgreen.svg
[License]: http://img.shields.io/npm/l/prettier_d.svg
[prettier]: https://github.com/prettier/prettier
[change401]: https://github.com/josephfrazier/prettier_d/blob/master/CHANGES.md#401

![Prettier Banner](https://raw.githubusercontent.com/prettier/prettier-logo/master/images/prettier-banner-light.png)

<h2 align="center">Opinionated Code Formatter</h2>

<p align="center">
  <em>
    JavaScript
    · TypeScript
    · Flow
    · JSX
    · JSON
  </em>
  <br />
  <em>
    CSS
    · SCSS
    · Less
  </em>
  <br />
  <em>
    HTML
    · Vue
    · Angular
  </em>
  <br />
  <em>
    GraphQL
    · Markdown
    · YAML
  </em>
  <br />
  <em>
    <a href="https://prettier.io/docs/en/plugins.html">
      Your favorite language?
    </a>
  </em>
</p>

<p align="center">
  <a href="https://dev.azure.com/prettier/prettier/_build/latest?definitionId=5">
    <img alt="Azure Pipelines Build Status" src="https://img.shields.io/azure-devops/build/prettier/79013671-677c-4846-a6d8-3050d40e21c0/5.svg?style=flat-square&label=build&branchName=master"></a>
  <a href="https://codecov.io/gh/prettier/prettier">
    <img alt="Codecov Coverage Status" src="https://img.shields.io/codecov/c/github/prettier/prettier.svg?style=flat-square"></a>
  <a href="https://twitter.com/acdlite/status/974390255393505280">
    <img alt="Blazing Fast" src="https://img.shields.io/badge/speed-blazing%20%F0%9F%94%A5-brightgreen.svg?style=flat-square"></a>
  <br/>
  <a href="https://www.npmjs.com/package/prettier">
    <img alt="npm version" src="https://img.shields.io/npm/v/prettier.svg?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/prettier">
    <img alt="weekly downloads from npm" src="https://img.shields.io/npm/dw/prettier.svg?style=flat-square"></a>
  <a href="#badge">
    <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"></a>
  <a href="https://gitter.im/jlongster/prettier">
    <img alt="Chat on Gitter" src="https://img.shields.io/gitter/room/jlongster/prettier.svg?style=flat-square"></a>
  <a href="https://twitter.com/PrettierCode">
    <img alt="Follow Prettier on Twitter" src="https://img.shields.io/twitter/follow/prettiercode.svg?label=follow+prettier&style=flat-square"></a>
</p>

## Intro

Prettier is an opinionated code formatter. It enforces a consistent style by parsing your code and re-printing it with its own rules that take the maximum line length into account, wrapping code when necessary.

### Input

<!-- prettier-ignore -->
```js
foo(reallyLongArg(), omgSoManyParameters(), IShouldRefactorThis(), isThereSeriouslyAnotherOne());
```

### Output

```js
foo(
  reallyLongArg(),
  omgSoManyParameters(),
  IShouldRefactorThis(),
  isThereSeriouslyAnotherOne()
);
```

Prettier can be run [in your editor](http://prettier.io/docs/en/editors.html) on-save, in a [pre-commit hook](https://prettier.io/docs/en/precommit.html), or in [CI environments](https://prettier.io/docs/en/cli.html#list-different) to ensure your codebase has a consistent style without devs ever having to post a nit-picky comment on a code review ever again!

---

**[Documentation](https://prettier.io/docs/en/)**

<!-- prettier-ignore -->
[Install](https://prettier.io/docs/en/install.html) ·
[Options](https://prettier.io/docs/en/options.html) ·
[CLI](https://prettier.io/docs/en/cli.html) ·
[API](https://prettier.io/docs/en/api.html)

**[Playground](https://prettier.io/playground/)**

---

## Badge

Show the world you're using _Prettier_ → [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

```md
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
