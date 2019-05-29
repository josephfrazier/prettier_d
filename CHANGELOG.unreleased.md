<!--

NOTE: Don't forget to add a link to your GitHub profile and the PR in the end of the file.

Format:

### Category: Title ([#PR] by [@user])

Description

```
// Input
Code Sample

// Output (Prettier stable)
Code Sample

// Output (Prettier master)
Code Sample
```

Details:

  Description: optional if the `Title` is enough to explain everything.

Examples:

### TypeScript: Correctly handle `//` in TSX ([#5728] by [@JamesHenry])

Previously, putting `//` as a child of a JSX element in TypeScript led to an error
because it was interpreted as a comment. Prettier master fixes this issue.

<!-- prettier-ignore --\>
```js
// Input
const link = <a href="example.com">http://example.com</a>

// Output (Prettier stable)
// Error: Comment location overlaps with node location

// Output (Prettier master)
const link = <a href="example.com">http://example.com</a>;
```

-->

### JavaScript: Do not hug sequence expression in object properties ([#6088] by [@evilebottnawi])

<!-- prettier-ignore -->
```js
// Input
const a = {
  someKey:
    (longLongLongLongLongLongLongLongLongLongLongLongLongLongName, shortName)
};

// Output (Prettier stable)
const a = {
  someKey: (longLongLongLongLongLongLongLongLongLongLongLongLongLongName,
  shortName)
};

// Output (Prettier master)
const a = {
  someKey:
    (longLongLongLongLongLongLongLongLongLongLongLongLongLongName, shortName)
};
```

- JavaScript: Fix closure compiler typecasts ([#5947] by [@jridgewell])

  If a closing parenthesis follows after a typecast in an inner expression, the typecast would wrap everything to the that following parenthesis.

### JavaScript: Don't break simple template literals ([#5979] by [@jwbay])

<!-- prettier-ignore -->
```js
// Input
console.log(chalk.white(`Covered Lines below threshold: ${coverageSettings.lines}%. Actual: ${coverageSummary.total.lines.pct}%`))

// Output (Prettier stable)
console.log(
  chalk.white(
    `Covered Lines below threshold: ${coverageSettings.lines}%. Actual: ${
      coverageSummary.total.lines.pct
    }%`
  )
);

// Output (Prettier master)
console.log(
  chalk.white(
    `Covered Lines below threshold: ${coverageSettings.lines}%. Actual: ${coverageSummary.total.lines.pct}%`
  )
);
```

### JavaScript: Correctly handle comments in empty arrow function expressions ([#6086] by [@evilebottnawi])

<!-- prettier-ignore -->
```js
// Input
const fn = (/*event, data*/) => doSomething(anything);

// Output (Prettier stable)
const fn = () => /*event, data*/ doSomething(anything);

// Output (Prettier master)
const fn = (/*event, data*/) => doSomething(anything);
```

### TypeScript: Keep trailing comma in tsx type parameters ([#6115] by [@sosukesuzuki])

Previously, a trailing comma after single type parameter in arrow function was cleaned up. The formatted result is valid as ts, but is invalid as tsx. Prettier master fixes this issue.

<!-- prettier-ignore -->
```tsx
// Input
type G<T> = any;
const myFunc = <T,>(arg1: G<T>) => false;

// Output (Prettier stable)
type G<T> = any;
const myFunc = <T>(arg1: G<T>) => false;

// Output (prettier master)
type G<T> = any;
const myFunc = <T,>(arg1: G<T>) => false;
```

### TypeScript: Don’t breakup call expressions when the last argument is an arrow function with a simple return type ([#6106] by [@brainkim])

<!-- prettier-ignore -->
```js
Fixes [an edge-case](#6099) where we were splitting up call expressions containing arrow functions with simple return types.
app.get("/", (req, res): void => {
  res.send("Hello World!");
});

// Output (Prettier stable)
app.get(
  "/",
  (req, res): void => {
    res.send("Hello World!");
  },
);

// Output (Prettier master)
app.get("/", (req, res): void => {
  res.send("Hello World!");
});
```

### JavaScript: Fix closure typecasts without spaces ([#6116] by [@jridgewell])

Previously, a space was required between the `@type` and opening `{` of a closure typecast, or else the enclosing parenthesis would be removed. Closure itself does not require a space.

<!-- prettier-ignore -->
```tsx
// Input
const v = /** @type{string} */(value);

// Output (Prettier stable)
const v = /** @type{string} */ value;

// Output (prettier master)
const v = /** @type{string} */ (value);
```

### JavaScript: Prevent adding quotes when using `--quote-props=consistent` and one of the keys were a computed "complex" expression ([#6119] by [@duailibe])

Previously, Prettier added unnecessary quotes to keys of an object, or properties and methods of classes, if there was at least one computed key with a "complex" expression (e.g. a member expression).

<!-- prettier-ignore -->
```js
// Input
const obj = {
  foo: "",
  [foo.bar]: "",
}

// Output (Prettier stable)
const obj = {
  "foo": "",
  [foo.bar]: "",
}

// Output (Prettier master)
const obj = {
  foo: "",
  [foo.bar]: "",
}
```

### JavaScript: Add parenthesis in JSX spread element with logical expressions ([#6130] by [@duailibe])

Previously, Prettier didn't add parenthesis in JSX spread elements because they aren't necessary, but for the sake of consistency with spread operator in objects and arrays, we'll add to JSX as well.

<!-- prettier-ignore -->
```js
// Input
<Component {...(props || {})} />;

// Output (Prettier stable)
<Component {...props || {}} />;

// Output (Prettier master)
<Component {...(props || {})} />;
```

### Markdown: correctly determine count of backticks in inline code ([#6110] by [@belochub])

By the CommonMark spec, it is required to 'choose a string of `n` backtick characters as delimiters, where the code does not contain any strings of exactly `n` backtick characters.'

This changes the method of finding the required count of backticks from using 2 backticks, when there is a backtick string of length 1 inside the inline code block, and using 1 backtick in all other cases, to finding a minimum length backtick string that can correctly be used as a delimiter.

<!-- prettier-ignore -->
````md
<!-- Input -->
``` 3 ``22`` `1` ```

`` 2 ```123``` `1` ``

<!-- Output (Prettier stable) -->
` 3 ``22`` `1` `

` 2 ```123``` `1` `

<!-- Output (Prettier master) -->
``` 3 ``22`` `1` ```

`` 2 ```123``` `1` ``
````

### JavaScript: Stop converting empty JSX elements to self-closing elemnts ([#6127] by [@duailibe])

Prettier has always converted empty JSX elements (`<div></div>`) to self-closing elements (`<div />`) because those are equivalent.

We have received feedback that during development, one would like to type the opening and closing tags and leave them to add the children later, but Prettier would convert it to a self-closing element, forcing the developer to manually convert them back. This has changed in this release.

<!-- prettier-ignore -->
```js
// Input
function Foo() {
  return <div></div>;
}

// Output (Prettier stable)
function Foo() {
  return <div />;
}

// Output (Prettier master)
function Foo() {
  return <div></div>;
}
```

### API: Prettier now works in Atom again ([#6129] by [@duailibe])

Atom has a security feature where code containing `eval` is not allowed to be run. One of Prettier's dependencies uses `eval` to prevent bundlers from including debug code. We've now made sure that this `eval` does not end up in the code we ship to npm, making Prettier play nice with Atom again.

### JavaScript: Add support for styled-jsx external styles ([#6089] by [@hongrich])

Add support for 2 external styles tags in `styled-jsx/css`: `css.global`, and `css.resolve`. https://github.com/zeit/styled-jsx/#external-css-and-styles-outside-of-the-component

The `css` template tag is already supported by Prettier.

Fixes https://github.com/zeit/styled-jsx/issues/548

<!-- prettier-ignore -->
```js
// Input
const styles = css.resolve`
.box {background:black;
}`;

// Output (Prettier stable)
const styles = css.resolve`
.box {background:black;
}`;

// Output (prettier master)
const styles = css.resolve`
  .box {
    background: black;
  }
`;
```

### TypeScript: Keep a pair of parentheses when there are extra pairs. ([#6131] by [@sosukesuzuki])

Previously, Prettier removes the necessary parentheses when trying to remove unnecessary parentheses, in TypeScript.

<!-- prettier-ignore -->
```ts
// Input
type G = ((keyof T))[];

// Output (Prettier stable)
type G = keyof T[];

// Output (prettier master)
type G = (keyof T)[];
```

### JavaScript: Keep parenthesis around functions and classes in `export default` declarations ([#6133] by [@duailibe])

Prettier was removing parenthesis from some expressions in `export default`, but if those are complex expressions that start with `function` or `class`, the parenthesis are required.

See below some practical examples, including one affecting TypeScript.

<!-- prettier-ignore -->
```ts
// Input
export default (function log() {}).toString();
export default (function log() {} as typeof console.log);

// Output (Prettier stable)
export default function log() {}.toString();
export default function log() {} as typeof console.log; // syntax error

// Output (Prettier master)
export default (function log() {}).toString();
export default (function log() {} as typeof console.log);
```

### TypeScript: Keep necessary parentheses around non-null assertions. ([#6136] by [@sosukesuzuki], [#6140] by [@thorn0], [#6148] by [@bakkot])

Previously, Prettier removed necessary parentheses around non-null assertions if the result of the assertion expression was called as a constructor.

<!-- prettier-ignore -->
```ts
// Input
const b = new (c()!)();

// Output (Prettier stable)
const b = new c()!();

// Output (Prettier master)
const b = new (c())!();
```

### Javascript: Address parentheses bugs for edge cases with call and new. ([#6148] by [@bakkot])

Adding all and only the necessary parentheses when mixing `new` with function calls is tricky. This change fixes two issues where necessary parentheses were omitted and one when redundant parentheses were added.

<!-- prettier-ignore -->
```ts
// Input
new (x()``.y)();
new (x()!.y)();
new e[f().x].y()

// Output (Prettier stable)
new x()``.y();
new x()!.y();
new e[(f()).x].y();

// Output (Prettier master)
new (x())``.y();
new (x())!.y();
new e[f().x].y();
```

### JavaScript: Fix nested embeds (JS in HTML in JS) ([#6038] by [@thorn0])

Previously, if JS code embedded in HTML (via `<script>`) embedded in JS (via a template literal) contained template literals, the inner JS was not formatted.

<!-- prettier-ignore -->
```js
// Input
const html = /* HTML */ `<script>var a=\`\`</script>`;

// Output (Prettier stable)
// SyntaxError: Expecting Unicode escape sequence \uXXXX (1:8)

// Output (Prettier master)
const html = /* HTML */ `
  <script>
    var a = \`\`;
  </script>
`;
```

### TypeScript: Keep line breaks within mapped types.([#6146] by [@sosukesuzuki])

Previously, Prettier has removed line breaks within mapped types.This change keeps it, similar to how it treats other object types.

<!-- prettier-ignore -->
```ts
// Input
type A<T> = {
  readonly [P in keyof T]: T[P];
};

// Output (Prettier stable)
type A<T> = { readonly [P in keyof T]: T[P] };

// Output (Prettier master)
type A<T> = {
  readonly [P in keyof T]: T[P];
};
```

### JavaScript: Keep necessary parentheses around the bind expression passed to "new" expression.([#6152] by [@sosukesuzuki])

Previously, Prettier has removed necessary parentheses around the bind expression if the result is passed to "new" expression.

<!-- prettier-ignore -->
```js
// Input
new (a::b)();

// Output (Prettier stable)
new a::b();

// Output (Prettier master)
new (a::b)();
```

### JavaScript: Prevent adding unnecessary parentheses around bind expressions in member expressions' properties ([#6159] by [@duailibe])

<!-- prettier-ignore -->
```js
// Input
f[a::b];

// Output (Prettier stable)
f[(a::b)];

// Output (Prettier master);
f[a::b];
```

[#5979]: https://github.com/prettier/prettier/pull/5979
[#6086]: https://github.com/prettier/prettier/pull/6086
[#6088]: https://github.com/prettier/prettier/pull/6088
[#6089]: https://github.com/prettier/prettier/pull/6089
[#6106]: https://github.com/prettier/prettier/pull/6106
[#6110]: https://github.com/prettier/prettier/pull/6110
[#6115]: https://github.com/prettier/prettier/pull/6115
[#6116]: https://github.com/prettier/prettier/pull/6116
[#6119]: https://github.com/prettier/prettier/pull/6119
[#6127]: https://github.com/prettier/prettier/pull/6127
[#6129]: https://github.com/prettier/prettier/pull/6129
[#6130]: https://github.com/prettier/prettier/pull/6130
[#6131]: https://github.com/prettier/prettier/pull/6131
[#6133]: https://github.com/prettier/prettier/pull/6133
[#6136]: https://github.com/prettier/prettier/pull/6136
[#6140]: https://github.com/prettier/prettier/pull/6140
[#6038]: https://github.com/prettier/prettier/pull/6038
[#6148]: https://github.com/prettier/prettier/pull/6148
[#6146]: https://github.com/prettier/prettier/pull/6146
[#6152]: https://github.com/prettier/prettier/pull/6152
[#6159]: https://github.com/prettier/prettier/pull/6159
[@belochub]: https://github.com/belochub
[@brainkim]: https://github.com/brainkim
[@duailibe]: https://github.com/duailibe
[@evilebottnawi]: https://github.com/evilebottnawi
[@hongrich]: https://github.com/hongrich
[@jridgewell]: https://github.com/jridgewell
[@jwbay]: https://github.com/jwbay
[@sosukesuzuki]: https://github.com/sosukesuzuki
[@thorn0]: https://github.com/thorn0
[@bakkot]: https://github.com/bakkot
