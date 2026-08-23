# Update FEMA Integration Platform Docker Instances
echo "Updating FEMA Integration Platform..."
git pull
docker compose pull
docker compose up -d --remove-orphans
echo "Successfully updated FEMA Integration Platform."