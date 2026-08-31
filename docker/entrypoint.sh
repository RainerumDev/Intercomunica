#!/bin/sh
set -eu

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy --schema server/prisma/schema.prisma

echo "Starting Intercomunica..."
exec node server/dist/index.js
