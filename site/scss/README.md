# Структура стилей PETRUHA19

Публичная часть собирается из `main.scss` в `site/css/main.css` и
`site/css/main.min.css`.

- `core/_variables.scss` — цвета, эффекты и размеры контейнера.
- `core/_base.scss` — reset, базовая типографика, scrollbar и focus-состояния.
- `layout/_header.scss` — header, burger и мобильное меню.
- `layout/_footer.scss` — footer.
- `pages/_home.scss` — только секции главной страницы.
- `pages/_portfolio.scss` — каталог опубликованных работ.
- `pages/_work-detail.scss` — страница отдельной работы.
- `admin.scss` — самостоятельная точка входа для админки.

После изменения SCSS выполните:

```bash
npm run css
```
