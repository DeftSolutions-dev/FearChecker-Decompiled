# FearChecker v2.0.2 decompiled

Полный исходный код FearChecker. (Так же все коментарии в проекте самого разработчика чекера, или же AI которая его создала xDD)

В самой аишной параше написано что разработчик "имеет более 8 лет опыта в создании решений для анализа". Ну как сказать. Весь бэкенд написан нейросетью, обфусцирован бесплатным obfuscator.io (даже не заплатили за нормальную защиту), фронтенд это один Vue файл на 1.5мб сгенеренный через Vite без какой-либо архитектуры, логгер пишет в файл "cheker.log" (не checker, а cheker, 8 лет опыта напоминаю), API полностью открытый без авторизации, оверлей качается по голому HTTP с захардкоженного IP. Тут не то что 8 лет, тут и на 1 год не тянет. Но зато есть красивое окошко и текст про опыт.

<img width="1595" height="898" alt="image" src="https://github.com/user-attachments/assets/db3ea26d-c1b0-4189-9415-bc9fa1975239" />

## Как запустить

```
npm install
```

Потом на Windows просто:
```
start.bat
```

Или из bash:
```
./start.sh
```

Если electron ругается что не находит модуль, убедись что переменная ELECTRON_RUN_AS_NODE не установлена. Скрипты start.bat и start.sh убирают её автоматически.

## Как собрать

```
npm run build
```

На выходе будет dist/win-unpacked/FearChecker.exe

## Что где лежит

```
├── app-electron/                бэкенд, полностью расшифрован
│   ├── main.js                  главный процесс
│   ├── preload.js               мост между фронтом и бэком
│   ├── steamScanner.js          сканер steam аккаунтов
│   └── lib/
│       ├── config.js            урлы, пути, настройки
│       ├── download.js          загрузчик файлов
│       ├── integrity.js         проверка целостности (sha256)
│       ├── ipcHandlers.js       все ipc обработчики
│       ├── logger.js            логи (тот самый cheker.log)
│       ├── overlay.js           оверлеи для cs2
│       └── systemInfo.js        сбор системной инфы и генерация hwid
├── dist/                        фронтенд (vue 3, оригинальный бандл)
│   ├── index.html
│   └── assets/
│       ├── index-k-Ij1-3Y.js   vue spa, все ещё в обфускации (rc4+base64)
│       └── index----SV6kV.css   стили
├── App/                         вспомогательные exe, бд, иконки
├── docs/                        частично расшифрованный фронтенд для справки
└── debug_api.py                 скрипт для дебага всех api запросов
```

## API

Все запросы GET, без авторизации, без ключей, без токенов. Просто дергаешь и получаешь данные.

| URL | Что делает |
|-----|-----------|
| https://api.fearcs2.ru/api/lang | переводы |
| https://api.fearcs2.ru/api/launcher-info | версия лаунчера |
| https://api.fearcs2.ru/api/library-apps | список приложений |
| https://api.fearcs2.ru/api/signatures | подписи |
| https://api.fearcs2.ru/api/overlay-version | версия оверлея |
| https://api.fearcs2.ru/api/download | скачать установщик |
| https://api.fearproject.ru/profile/{steamId} | профиль по steamid |
| https://api.ipify.org?format=json | определение ip |
| http://213.171.7.74:3142/download/over.zip | оверлей (голый http, да) |

В CORS заголовках сервер светит что принимает Authorization и X-Admin-Key, но само приложение их не шлет без discord OAuth.

## HWID

Генерится в systemInfo.js, sha256 от hostname + материнка + название ОС + серийник платы, обрезается до 32 символов:

```js
const source = [hostname, motherboard, osName, boardSerialNumber].filter(Boolean).join("|");
const hwid = crypto.createHash("sha256").update(source).digest("hex").slice(0, 32);
```

## Статус расшифровки

| Файл | Статус |
|------|--------|
| main.js | 100% |
| preload.js | 100% |
| steamScanner.js | 100% |
| config.js | 100% |
| download.js | 100% |
| integrity.js | 100% |
| ipcHandlers.js | 100% |
| logger.js | 100% |
| overlay.js | 100% |
| systemInfo.js | 100% |
| фронтенд (vue) | оригинальный бандл, частичная расшифровка в docs/ |

Бэкенд: 0 обфусцированных переменных, все имена читаемые.

Фронтенд используется оригинальный потому что расшифрованный ломает vue.

## Стек чекера

Electron 28.3.3, Vue 3.5.28, Node 18.18.2. Обфускация obfuscator.io (бэкенд string array rotation, фронтенд rc4+base64). Деобфускация заняла меньше времени чем он потратил на написание текста про 8 лет опыта.
