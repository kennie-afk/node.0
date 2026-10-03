# source this, then: npm run migrate && npx vitest run
# needs: docker run -d --name sojaa-pg -e POSTGRES_USER=sojaa -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=sojaa_test -p 55442:5432 postgres:16-alpine
export DATABASE_URL=postgres://sojaa_app:app-password-123@localhost:55442/sojaa_test
export DATABASE_MIGRATION_URL=postgres://sojaa:ownerpw@localhost:55442/sojaa_test
export SOJAA_APP_PASSWORD=app-password-123
export JWT_SECRET=test-secret-test-secret-test-secret-1234
export MPESA_CALLBACK_SECRET=mpesa-secret-1234567
export NODE_ENV=test SOJAA_INTEGRATION=1 SIGNUP_RESEND_COOLDOWN_SECONDS=0 API_RATE_LIMIT_PER_MINUTE=100000 MPESA_SIMULATOR=true
export LOG_LEVEL=error
