" autocmd FileType javascript setlocal formatprg=../bin/prettier_d.js\ --parser=babel
" autocmd BufWritePre,TextChanged,InsertLeave */bin/*.js Neoformat
" autocmd BufWritePre,TextChanged,InsertLeave */lib/*.js Neoformat

" " Use formatprg when available
" let g:neoformat_try_formatprg = 1
" " https://github.com/sbdchd/neoformat/issues/25
" let g:neoformat_only_msg_on_error = 1
