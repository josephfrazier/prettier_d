# TODO

* Add .editorconfig support
  * See here for sample `editorconfig` API usage: https://github.com/josephfrazier/prettier-diff/blob/2cb938272b968869202f30d77e30dbf6d52ac8bf/bin/prettier-diff#L74-L81
  * https://github.com/prettier/prettier/issues/42
* Add test for --local-only option
  * Currently, you can test it like
  ```
  yarn link
  cd ~
  echo 1 > t.js
  prettier_d --local-only t.js
  prettier_d --local-only t.js --fallback
  ```
* Add tests for --pkg-conf option
* Allow options to override --pkg-conf
* Support all prettier options
  * multiple files
    * exit code might be tricky for this one
* Figure out how to use prettier's test cases?
