autocmd FileType javascript setlocal formatprg=../bin/prettier_dnc.sh\ --fallback\ --pkg-conf\ --keep-indentation
autocmd BufWritePre */bin/*.js Neoformat
autocmd BufWritePre */lib/*.js Neoformat

" Use formatprg when available
let g:neoformat_try_formatprg = 1
" https://github.com/sbdchd/neoformat/issues/25
let g:neoformat_only_msg_on_error = 1
