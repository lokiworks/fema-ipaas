rm -rf ~/.fema
rm -rf node_modules/
docker container rm fema_devcontainer_db_1 --force
docker container rm fema_devcontainer_redis_1 --force
docker container rm fema_devcontainer_app_1 --force
docker volume rm fema_devcontainer_redis_data
docker volume rm fema_devcontainer_postgres_data

echo "Deleted fema dev dockers and volumes."