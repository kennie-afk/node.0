# source this, then: npm run migrate && npx vitest run
# needs: docker run -d --name hazina-pg -e POSTGRES_USER=hazina -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=hazina_test -p 55441:5432 postgres:16-alpine
export DATABASE_URL=postgres://hazina_app:app-password-123@localhost:55441/hazina_test
export DATABASE_MIGRATION_URL=postgres://hazina:ownerpw@localhost:55441/hazina_test
export HAZINA_APP_PASSWORD=app-password-123
export JWT_SECRET=test-secret-test-secret-test-secret-1234
export MPESA_CALLBACK_SECRET=mpesa-secret-1234567
export NODE_ENV=test HAZINA_INTEGRATION=1 SIGNUP_RESEND_COOLDOWN_SECONDS=0 API_RATE_LIMIT_PER_MINUTE=100000 MPESA_SIMULATOR=true
export LOG_LEVEL=error
