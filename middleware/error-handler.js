'use strict';

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Маршрут не найден.' });
  }

  return res.status(404).send('Страница не найдена');
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  console.error(error);

  const status = Number(error?.status || error?.statusCode) || 500;
  const isSafeMessage = status >= 400 && status < 500;

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      message: isSafeMessage
        ? String(error.message || 'Некорректный запрос.')
        : 'Внутренняя ошибка сервера.',
    });
  }

  return res.status(status).send('Внутренняя ошибка сервера');
}

module.exports = { notFoundHandler, errorHandler };
