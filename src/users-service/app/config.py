from decouple import config # type: ignore

DATABASE_URL = config("DATABASE_URL", default="postgresql://users_user:users_password_123@clickly_users_db:5432/users_db")

SECRET_KEY = config("SECRET_KEY", default="super-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60

DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_ORIGINS = config("ALLOWED_ORIGINS", default="http://localhost,http://localhost:3001,http://127.0.0.1:3000,http://localhost:8080,http://localhost:8000,file://,null").split(",")

ADMIN_TOKEN = config("ADMIN_TOKEN", default="admin_secret_token_12345")

SMTP_SERVER = config("SMTP_SERVER", default="smtp.gmail.com")
SMTP_PORT = config("SMTP_PORT", default=587, cast=int)
SMTP_USERNAME = config("SMTP_USERNAME", default="")
SMTP_PASSWORD = config("SMTP_PASSWORD", default="")
SMTP_USE_TLS = config("SMTP_USE_TLS", default=True, cast=bool)
FROM_EMAIL = config("FROM_EMAIL", default="noreply@clickly.com")
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost")

EMAIL_ACTIVATION_TOKEN_EXPIRE_HOURS = config("EMAIL_ACTIVATION_TOKEN_EXPIRE_HOURS", default=24, cast=int)
EMAIL_ACTIVATION_RESEND_COOLDOWN_MINUTES = config("EMAIL_ACTIVATION_RESEND_COOLDOWN_MINUTES", default=5, cast=int)