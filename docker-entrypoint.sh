#!/bin/sh
set -eu

echo "Applying local D1 migrations..."
pnpm db:migrate:local

echo "Starting the development server..."
exec pnpm dev --host 0.0.0.0
