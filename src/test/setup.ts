// Глобальные env-моки для всех тестов.
process.env.SESSION_SECRET ||= 'test-session-secret-minimum-32-characters!!';
process.env.INVITE_ADMIN_SECRET ||= 'test-invite-admin-secret';
process.env.DIRECTUS_ADMIN_TOKEN ||= 'test-admin-token';
process.env.NEXT_PUBLIC_DIRECTUS_URL ||= 'http://localhost:8055';
process.env.NEXT_PUBLIC_BASE_PATH ||= '/app';
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
process.env.LOG_LEVEL ||= 'silent';
