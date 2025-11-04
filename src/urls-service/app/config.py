from decouple import config # type: ignore

DATABASE_URL = config("DATABASE_URL", default="postgresql://url_user:url_password@clickly_url_db:5432/url_db")
SECRET_KEY = config("SECRET_KEY", default="super-secret")

DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_ORIGINS = config("ALLOWED_ORIGINS", default="http://localhost,http://localhost:3001,http://127.0.0.1:3000,http://localhost:8080,http://localhost:8000,file://,null").split(",")

USERS_SERVICE_URL = config("USERS_SERVICE_URL", default="http://clickly_users_service:8000")
ANALYTICS_SERVICE_URL = config("ANALYTICS_SERVICE_URL", default="http://clickly_analytics_service:8003")

MAX_CUSTOM_URL_LENGTH = config("MAX_URL_LENGTH", default=20, cast=int)
SHORT_CODE_LENGTH = config("SHORT_CODE_LENGTH", default=6, cast=int)

RESERVED_SHORT_CODES = {
    "my", "stats", "health", "admin", "api", "www", "ftp", "mail", 
    "email", "help", "support", "about", "contact", "terms", "privacy",
    "login", "register", "signup", "signin", "logout", "dashboard",
    "profile", "settings", "config", "test", "debug", "dev", "prod",
    "me", "shorten", "index.html", "verify-token", "logout", "events",
    "links", "dashboard", "export"
}

ADMIN_TOKEN = config("ADMIN_TOKEN", default="admin_secret_token_12345")
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost")

GOOGLE_SAFE_BROWSING_API_KEY = config("GOOGLE_SAFE_BROWSING_API_KEY", default="")
SAFE_BROWSING_ENABLED = config("SAFE_BROWSING_ENABLED", default=True, cast=bool)