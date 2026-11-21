#!/bin/sh
# Punto de entrada del contenedor backend.
# En desarrollo aplica migraciones al iniciar; el seed se ejecuta manualmente.
set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

exec "$@"
