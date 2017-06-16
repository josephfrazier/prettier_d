# TODO

* Add test for --local-only option
  * Currently, you can test it like
  ```bash
  yarn link
  tmpdir=$(mktemp -d)
  pushd $tmpdir
  echo 1 > t.js
  prettier_d --local-only t.js # should error
  prettier_d --local-only t.js --fallback # should print `1`
  rm t.js
  popd
  rmdir $tmpdir
  ```
* Add tests for --pkg-conf option
* Allow options to override --pkg-conf
* Support all prettier options
  * multiple files
    * exit code might be tricky for this one
* Figure out how to use prettier's test cases?
