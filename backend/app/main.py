import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from .database import engine, Base
from .config import get_settings
from .limiter import limiter
from .routers import auth_router, sessions, reports, groups, admin

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("insomnia_ai")

# Load settings
settings = get_settings()

# Security check on JWT_SECRET
DEFAULT_UNSAFE_SECRET = "insomnia-ai-secret-key-change-in-production"
if settings.JWT_SECRET == DEFAULT_UNSAFE_SECRET or len(settings.JWT_SECRET) < 16:
    logger.warning(
        "\n=======================================================\n"
        "WARNING: Using default or weak JWT_SECRET!\n"
        "Please update JWT_SECRET in production for real security.\n"
        "======================================================="
    )

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Insomnia AI API",
    description="Backend para detección de somnolencia y distracción",
    version="1.0.0",
)

# Configure rate limiter on FastAPI app state and register error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — dynamic origins from config
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router.router)
app.include_router(sessions.router)
app.include_router(reports.router)
app.include_router(groups.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return {"message": "Insomnia AI API v1.0", "docs": "/docs"}
