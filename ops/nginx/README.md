# nginx на прод-хосте

Файлы здесь **не выкатываются автоматически**. Они копируются руками:

    scp ops/nginx/rosneft.conf root@85.192.26.113:/etc/nginx/sites-available/rosneft
    scp ops/nginx/limits.conf  root@85.192.26.113:/etc/nginx/conf.d/limits.conf
    ssh root@85.192.26.113 'nginx -t && systemctl reload nginx'

`nginx -t` **до** reload, всегда: битая конфигурация при reload оставляет
работать старую, но при следующем рестарте хоста nginx не поднимется.

## Правка mime.types, которой нет в этих файлах

Стоковый `/etc/nginx/mime.types` (1.24) знает `js`, но не знает `mjs` и
`webmanifest` — оба отдаются как `application/octet-stream`. Chrome строго
проверяет MIME у ES-модулей, поэтому вендоренный pdf.js 6 загружал статичный
тулбар и молча ничего не делал: `viewer.mjs` и `pdf.mjs` приходили с кодом 200
и не исполнялись.

    application/javascript  js mjs;
    application/manifest+json  webmanifest;

Резервная копия исходного файла — `/root/backups/mime.types-*.bak`.

Вендорите новый `.mjs`/`.wasm`-рантайм? Проверьте `content_type` curl'ом с
`--resolve` **прежде** чем считать, что это работает.
