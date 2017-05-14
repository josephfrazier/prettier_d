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
* Add tests for --pkg-conf option
* Allow options to override --pkg-conf
* Support all prettier options
  * multiple files
    * exit code might be tricky for this one
* Figure out how to use prettier's test cases?
