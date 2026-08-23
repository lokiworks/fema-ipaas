rm -rf ~/.fema
docker compose down
docker volume rm fema_redis_data
docker volume rm fema_postgres_data
echo "Deleted fema dockers and volumes."