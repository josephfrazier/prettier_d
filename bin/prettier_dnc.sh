#!/usr/bin/env bash

IFS=' ' read PORT TOKEN < ~/.prettier_d

if nc 2>&1 | grep -- -q >/dev/null; then
  cat <(echo "$TOKEN $PWD --stdin $@") - | nc -q 0 localhost $PORT
else
  cat <(echo "$TOKEN $PWD --stdin $@") - | nc      localhost $PORT
fi
