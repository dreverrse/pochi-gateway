from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, gateway
from app.core.config import settings
from app.core.security import load_admin_token
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(settings)
    app.state.admin_token = load_admin_token(settings)
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
