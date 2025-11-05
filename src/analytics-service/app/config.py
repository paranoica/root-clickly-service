from decouple import config # type: ignore

DATABASE_URL = config("DATABASE_URL", default="postgresql://analytics_user:analytics_pass@easylink_analytics_db:5432/analytics_db")
ALLOWED_ORIGINS = config("ALLOWED_ORIGINS", default="http://localhost,http://localhost:3001,http://127.0.0.1:3000,http://localhost:8080,http://localhost:8000,file://,null").split(",")

SECRET_KEY = config("SECRET_KEY", default="analytics-secret-key-change-in-production")
ALGORITHM = "HS256"

USERS_SERVICE_URL = config("USERS_SERVICE_URL", default="http://easylink_users_service:8000")
URL_SERVICE_URL = config("URL_SERVICE_URL", default="http://easylink_url_service:8001")

ADMIN_TOKEN = config("ADMIN_TOKEN", default="admin_secret_token_12345")
MAX_EXPORT_RECORDS = config("MAX_EXPORT_RECORDS", default=100000, cast=int)