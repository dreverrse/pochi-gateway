import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, gateway, workflows
from app.core.config import settings
from app.core.security import load_admin_token
from app.db.database import init_db
from app.services.workflow_scheduler import scheduler_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(settings)
    app.state.admin_token = load_admin_token(settings)
    scheduler = (
        asyncio.create_task(scheduler_loop())
        if settings.workflow_scheduler_enabled
        else None
    )
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.cancel()
            with suppress(asyncio.CancelledError):
                await scheduler


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dokumentasi interaktif memuat skrip dari CDN, jadi CSP ketat tidak dipasang di sana.
_DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
# Shell UI dilayani dari origin yang sama: bundle JS eksternal, satu <style> inline
# dari index.html, dan style atribut dari React.
_UI_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
)
_API_PREFIXES = ("/api", "/v1", "/hooks", "/health", "/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path not in _DOC_PATHS:
        is_api = request.url.path.startswith(_API_PREFIXES)
        headers.setdefault("Content-Security-Policy", _API_CSP if is_api else _UI_CSP)
    if request.url.scheme == "https":
        headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    # Aset Vite punya hash di nama file → aman di-cache lama. index.html tidak:
    # tanpa no-cache, browser memakai aturan heuristik dan bisa menyajikan shell
    # lama yang masih menunjuk bundle yang sudah tidak ada setelah rebuild.
    path = request.url.path
    if path.startswith("/assets/"):
        headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif path == "/" or path.endswith(".html"):
        headers.setdefault("Cache-Control", "no-cache")
    return response

@app.exception_handler(RequestValidationError)
async def gateway_validation_error(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/v1/"):
        errors = exc.errors()
        message = errors[0].get("msg", "Invalid request body.") if errors else "Invalid request body."
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "message": message,
                    "type": "invalid_request_error",
                    "param": None,
                    "code": "invalid_request",
                }
            },
        )
    return await request_validation_exception_handler(request, exc)


app.include_router(gateway.router)
app.include_router(admin.public_router)
app.include_router(admin.router)
app.include_router(workflows.router)
app.include_router(workflows.hooks_router)

# Build frontend dilayani dari origin yang sama supaya satu port cukup di belakang
# tunnel/proxy. Kalau dist belum ada (dev), Vite di :5173 yang melayani UI.
_DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_DIST_DIR, html=True), name="ui")
