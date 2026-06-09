from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth_router, sessions, reports, groups, admin

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Insomnia AI API",
    description="Backend para detección de somnolencia y distracción",
    version="1.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev
        "http://localhost:4173",  # Vite preview
        "http://127.0.0.1:5173",
    ],
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
