process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.DATABASE_SSL = 'false';
process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough-32';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'error';
