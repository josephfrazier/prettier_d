let f = (/* ... */) => {}
(function (/* ... */) {})(/* ... */)
function f(/* ... */) {}

const obj = {
  f(/* ... */) {},
  f: (/* ... */) => {},
  f: function(/* ... */) {},
  f: function f(/* ... */) {}
}

class Foo {
  f(/* ... */) {}
  f() /* ... */ {}
  f = (/* ... */) => {};
  static f(/* ... */) {};
  static f = (/* ... */) => {};
  static f = function(/* ... */) {};
  static f = function f(/* ... */) {};
}

f(/* ... */);
f(a, /* ... */);
f(a, /* ... */ b);
f(/* ... */ a, b);

let f = () => import(a /* ... */);
let f = () => doThing(a, /* ... */ b);
