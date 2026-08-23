#!/usr/bin/env bash

cp .env.example .env

if [ "$(uname)" = "Darwin" ]; then
  sed -i '' -e 's|FEMA_API_KEY=.*|FEMA_API_KEY='"$(openssl rand -hex 64)"'|g' .env
  sed -i '' -e 's|FEMA_POSTGRES_PASSWORD=.*|FEMA_POSTGRES_PASSWORD='"$(openssl rand -hex 32)"'|g' .env
  sed -i '' -e 's|FEMA_JWT_SECRET=.*|FEMA_JWT_SECRET='"$(openssl rand -hex 32)"'|g' .env
  sed -i '' -e 's|ENCRYPTION_KEY=.*|ENCRYPTION_KEY='"$(openssl rand -hex 16)"'|g' .env
else
  sed -i 's|FEMA_API_KEY=.*|FEMA_API_KEY='"$(openssl rand -hex 64)"'|g' .env
  sed -i 's|FEMA_POSTGRES_PASSWORD=.*|FEMA_POSTGRES_PASSWORD='"$(openssl rand -hex 32)"'|g' .env
  sed -i 's|FEMA_JWT_SECRET=.*|FEMA_JWT_SECRET='"$(openssl rand -hex 32)"'|g' .env
  sed -i 's|ENCRYPTION_KEY=.*|ENCRYPTION_KEY='"$(openssl rand -hex 16)"'|g' .env
fi;

echo "A .env file containing random passwords and secrets has been successfully generated."
