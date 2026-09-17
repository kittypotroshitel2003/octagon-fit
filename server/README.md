# Приём заявок с сайта OCTAGON-FIT

Маленький сервис на Node.js. Принимает `POST /api/lead` и рассылает заявку
на почту клуба и в Telegram-группу. Сайт остаётся статикой — сервис нужен
только для форм.

## Нужен ли он вообще

У студии уже есть общее реле форм — `https://forms.a-4-to.ru`. При деплое
`deploy.js` сам подставляет в каждую HTML-страницу скрипт `form.js`, а
команда `node deploy.js --telegram <chatId>` привязывает домен к группе
в `/srv/forms/sites.json`. Этого достаточно, чтобы заявки падали в Telegram.

Реле не умеет двух вещей:

* **письма на почту** — только Telegram;
* **файлы** — резюме из формы «Хотите работать с нами?» оно пропускает
  (`type="file"` в нём отключён явно).

Поэтому:

| Что нужно | Чего хватит |
|---|---|
| только Telegram | реле студии, этот сервис не нужен |
| Telegram + почта + резюме файлом | реле для Telegram + этот сервис для почты |

Фронтенд рассчитан на оба варианта сразу. Формы помечены `data-tg="off"`,
чтобы реле не перехватывало их само (оно читает поля по атрибуту `name` и
прислало бы заявку с пустыми полями) — вместо этого `assets/lead-form.js`
отдаёт данные явно через `window.FormRelay.send()` с русскими названиями
полей. Заявка считается принятой, если сработал **хотя бы один** канал:
пока этот сервис не поднят, посетитель всё равно видит «заявка отправлена»,
потому что Telegram её получил.

## Что заполнить перед запуском

```bash
cp .env.example .env
nano .env
```

В `.env` нужны четыре значения — как их получить, написано в комментариях
внутри файла:

| Переменная | Что это |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | ID группы, куда падают заявки |
| `SMTP_USER` | почта, с которой уходят письма |
| `SMTP_PASS` | **пароль приложения** Яндекса, не пароль от почты |

Каналы независимы: если заполнена только почта — заявки идут на почту,
только Telegram — только в Telegram. Заявка считается принятой, если
сработал хотя бы один канал. Все заявки дополнительно пишутся
в `leads.log`, так что ничего не теряется даже при сбое обоих каналов.

## Установка на сервер

```bash
# 1. Скопировать папку server/ на сервер
scp -r server/ root@СЕРВЕР:/srv/octagon-fit-api

# 2. Поставить зависимости
cd /srv/octagon-fit-api && npm install --omit=dev

# 3. Проверить, что запускается
node lead-api.mjs
# → OCTAGON-FIT lead API — http://127.0.0.1:8787/api/lead
```

## Автозапуск (systemd)

`/etc/systemd/system/octagon-lead-api.service`:

```ini
[Unit]
Description=OCTAGON-FIT lead API
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/octagon-fit-api
ExecStart=/usr/bin/node /srv/octagon-fit-api/lead-api.mjs
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now octagon-lead-api
systemctl status octagon-lead-api
```

## Caddy

В блок сайта добавить проксирование `/api/*` на сервис:

```caddy
octagon-fit.ru {
    root * /srv/sites/octagon-fit.ru
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8787
    }

    handle {
        file_server
    }
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## Проверка

```bash
curl https://octagon-fit.ru/health
# {"ok":true,"telegram":true,"mail":true}

curl -X POST https://octagon-fit.ru/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"type":"Тест","name":"Проверка","phone":"+79180000000","consent":"да"}'
# {"ok":true}  → сообщение должно прийти в группу и на почту
```

## Защита от спама

* скрытое поле-ловушка в каждой форме — заполненное считается ботом;
* не больше 10 заявок за 10 минут с одного IP;
* тело запроса ограничено 8 МБ, резюме — 5 МБ;
* заявка без отметки о согласии на обработку данных не принимается.

## Если адрес сервиса другой

Сайт отправляет заявки на путь из `window.OCT_LEAD_ENDPOINT`
(файл `assets/lead-form.js`, первые строки). По умолчанию — `/api/lead`
на том же домене. Для отдельного домена укажите полный адрес и добавьте
его в `ALLOWED_ORIGINS`.
