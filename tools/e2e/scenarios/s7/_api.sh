API=http://localhost:3107/api
login() {
  curl -s -X POST $API/v1/authentication/sign-in -H 'content-type: application/json' -d '{"email":"dev@ap.com","password":"12345678"}' > /tmp/fema-e2e/slot-7/login.json
  TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/fema-e2e/slot-7/login.json'))['token'])")
  PROJECT=$(python3 -c "import json;print(json.load(open('/tmp/fema-e2e/slot-7/login.json'))['projectId'])")
}
