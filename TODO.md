# TODO

* Add test for --local-only option
  * Currently, you can test it like
  ```
  yarn link
  cd ~
  echo 1 > t.js
  prettier_d --local-only t.js
  prettier_d --local-only t.js --fallback
  ```
* Look for config using e.g. https://www.npmjs.com/package/rc
  * May also want to check package.json for `prettier` field. See https://github.com/prettier/prettier/issues/918
  * See also https://github.com/prettier/prettier/issues/98
* Support all prettier options
  * multiple files
    * exit code might be tricky for this one
* Figure out how to use prettier's test cases?
