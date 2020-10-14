# Changes

## Post-5.7.4

- Become a fork of Prettier instead using whatever Prettier is installed separately
- Remove custom option parsing, defer to Prettier instead
- Stop versioning (install from GitHub to use)
- Remove `prettier_dnc` script (use `prettier_d` directly instead)

## 5.6.0

- Add .editorconfig support to --pkg-conf option
- Add `--keep-indentation` option

## 5.5.0

- Parse `.prettierrc` for config as well as `package.json`

## 5.4.0

- Add `prettier_dnc` script to streamline netcat usage
- Add `--local-only` option/docs
- Add `--pkg-conf` option for reading prettier config from nearest package.json

## 5.3.0

- Add support for `--write` and `--list-different` options
- Document --fallback and --json in --help message

## 5.2.0

- Make it possible to pipe a stream to netcat
- Document unsupported `prettier` options
- Improve `--help` message

## 5.1.0

- Improve CLI parity with `prettier`
- Add `--json` and `--fallback` options.

## 5.0.0

Rename project to prettier_d.js, run [prettier] instead of eslint. Note that no options are currently supported, only simple usage like:

```bash
prettier_d file.js # prints formatted file to stdout

# moar speed
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`
echo "$TOKEN $PWD file.js" | nc localhost $PORT
```

[prettier]: https://github.com/prettier/prettier

## 4.2.5

Add `.vimrc` example for buffer auto-fixing to README.

## 4.2.4

Exit with status 1 when an error occurs. Fixes [#63][issue 63].

[issue 63]: https://github.com/mantoni/eslint_d.js/issues/63

## 4.2.2

Fix `--fix-to-stdout` when used with an ignored file.

## 4.2.1

Fix [`--fix-to-stdout` when used with an empty file][pull 59].

[pull 59]: https://github.com/mantoni/eslint_d.js/pull/59

## 4.2.0

An exciting new feature comes to eslint_d, the first one that is not part of
eslint itself. [Aaron Jensen implemented][pull 53] `--fix-to-stdout` which
allows to integrated `eslint --fix` into your editor as a save action 🎉

Currently, this feature only works with `--stdin` and you can test it like this:

```
$ cat ./some/file.js | eslint_d --fix-to-stdout --stdin
```

[pull 53]: https://github.com/mantoni/eslint_d.js/pull/53

## 4.1.0

Support for `--print-config` was [added by Aaron Jensen][pull 51]. He also
added instructions for Emacs users.

[pull 51]: https://github.com/mantoni/eslint_d.js/pull/51

## 4.0.1

Fixes a security issue that was [noticed by Andri Möll][issue 45]. Thanks for
reporting! To avoid CSRF attacks, this [introduces a security token][pull 46]
that must be sent by clients on each request. This change also binds the daemon
explicitly to `127.0.0.1` instead of implicitly listening on all network
interfaces.

[issue 45]: https://github.com/mantoni/eslint_d.js/issues/45
[pull 46]: https://github.com/mantoni/eslint_d.js/pull/46

## 4.0.0

Use ESLint 3.

## 3.1.2

Back-ported the security fix from `v4.0.1`.

## 3.1.1

As per a [recent change in eslint][bda5de5] the default parser `espree` [was
removed][pull 43]. The `eslint` dependency was bumped to `2.10.2` which
introduced the change.

[bda5de5]: https://github.com/eslint/eslint/commit/bda5de5
[pull 43]: https://github.com/mantoni/eslint_d.js/pull/43

## 3.1.0

The `eslint_d` command will now exit with code 1 if errors where reported.

## 3.0.1

A [fix was provided by ruanyl][pull #33] to resolve `chalk` relative from the
actually resolved eslint module.

[pull #33]: https://github.com/mantoni/eslint_d.js/pull/33

## 3.0.0

jpsc got the [eslint 2 upgrade][pull #30] started. `eslint_d` will now use
eslint 2.2+ if no local install of eslint is found.

Also in this release:

- Support `--inline-config` and `--cache-location` options
- Pass `cwd` through to eslint.

[pull #30]: https://github.com/mantoni/eslint_d.js/pull/30

## 2.5.1

- Fix `--fix`
- Fix color for local eslint

## 2.5.0

- Support color and the `--no-color` option (fixes [issue #7][])
- Improve formatting in "Editor integration" documentation

[issue #7]: https://github.com/mantoni/eslint_d.js/issues/7

## 2.4.0

Roger Zurawicki [figured out][pull #24] how to make `eslint_d` work in WebStorm.

- Add information about `--cache` in the readme (netei)
- Add symlink to `eslint.js` for WebStorm compat (Roger Zurawicki)

[pull #24]: https://github.com/mantoni/eslint_d.js/pull/24

## 2.3.2

Fixes an error in case no local eslint module can be found (Kevin Yue)

- [Issue #17](https://github.com/mantoni/eslint_d.js/issues/17)
- [Pull request #18](https://github.com/mantoni/eslint_d.js/pull/18)

## 2.3.1

- Remove `concat-stream` dependency and micro optimizations (Richard Herrera)

## 2.3.0

Richard Herrera implemented a missing eslint feature to [lint text provided via
stdin][]. This also fixes [issue #13][].

[lint text provided via stdin]: https://github.com/mantoni/eslint_d.js/pull/15
[issue #13]: https://github.com/mantoni/eslint_d.js/issues/13

## 2.2.0

Resolves the `eslint` module for each working directory separately. This allows
multiple versions of eslint to co-exist. This is required to support local
plugins like the `babel-eslint` parser (see [issue #10][]). If no local eslint
install is found, the one that was installed with `eslint_d` is used.

[issue #10]: https://github.com/mantoni/eslint_d.js/issues/10

## 2.1.2

Fixes [issue #9][] with space-containing config path or other shell parameters
that need escaping.

[issue #9]: https://github.com/mantoni/eslint_d.js/issues/9

## 2.1.1

Fixes [issue #8][] on Windows when launching in a `cmd` shell where `eslint_d`
was hanging indefinitely.

- Update Sublime linter URL to it's new home
- Add note for Atom users

[issue #8]: https://github.com/mantoni/eslint_d.js/issues/8

## 2.1.0

Make `eslint_d` work out of the box in vim with the syntastic eslint checker.

- Add `--version` and `-v` options
- Do not start server when called with `-h` or `--help`
- Downgrade `optionator` to align with eslint
- Update instructions for vim integration

## 2.0.0

This release support (almost) all `eslint` options. Check `eslint_d --help`.

Breaking that API already: The `lint` command was removed and in case you're
not passing a control command like `start`, `stop`, `restart` or `status`, the
given options are passed to the linter.

Also, the default output format was changed from `compact` to `stylish` to
align with `eslint`.

- Document vim syntastic javascript checkers (Chris Gaudreau)
- invokations -> invocations (Juho Vepsäläinen)
- Document Sublime editor integration
- Handle linter exceptions

## 1.0.0

- Initial release
