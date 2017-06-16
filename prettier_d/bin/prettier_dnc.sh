#!/usr/bin/env bash
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`
cat <(echo "$TOKEN $PWD --stdin $@") - | nc localhost $PORT
