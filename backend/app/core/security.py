import hashlib
import os
import secrets
import threading
import time
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, settings

bearer_scheme = HTTPBearer(auto_error=False)


class SecretBoxError(Exception):
    pass


class SecretBox:
    def __init__(self, key_path: Path):
        self.key_path = key_path
        try:
            self._fernet = Fernet(self._load_or_create_key())
        except (ValueError, TypeError) as exc:
            raise SecretBoxError("Kunci enkripsi tidak valid") from exc

    def _load_or_create_key(self) -> bytes:
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        if self.key_path.exists():
            key = self.key_path.read_bytes().strip()
            _restrict_permissions(self.key_path)
            return key

        key = Fernet.generate_key()
        try:
            descriptor = os.open(
                self.key_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
        except FileExistsError:
            return self.key_path.read_bytes().strip()

        with os.fdopen(descriptor, "wb") as handle:
            handle.write(key)
        _restrict_permissions(self.key_path)
        return key

    def encrypt(self, plaintext: str) -> str:
        try:
            return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        except Exception as exc:
            raise SecretBoxError("Gagal mengenkripsi secret") from exc

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError) as exc:
            raise SecretBoxError("Gagal mendekripsi secret") from exc


def _restrict_permissions(path: Path) -> None:
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


@lru_cache(maxsize=4)
def get_secret_box(key_path: Path | None = None) -> SecretBox:
    return SecretBox(key_path or settings.secret_key_path)


def load_admin_token(settings: Settings) -> str:
    configured = settings.admin_token.strip()
    if configured:
        return configured

    path = settings.admin_token_path
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        token = path.read_text(encoding="utf-8").strip()
        if token:
            _restrict_permissions(path)
            return token
        path.unlink()

    token = secrets.token_urlsafe(32)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        existing = path.read_text(encoding="utf-8").strip()
        if not existing:
            raise RuntimeError(f"File admin token kosong: {path}")
        _restrict_permissions(path)
        return existing

    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(token + "\n")
    _restrict_permissions(path)
    return token


def hash_api_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def compare_admin_tokens(candidate: str, expected: str) -> bool:
    if not candidate or not expected:
        return False
    return secrets.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


class LoginThrottle:
    """Pembatas percobaan login per alamat klien (sliding window, in-memory).

    Satu proses uvicorn, jadi state cukup di memori. Restart server
    mengosongkan hitungan; itu disengaja agar tidak ada state yang bisa
    dipakai untuk mengunci admin secara permanen.
    """

    def __init__(
        self,
        max_attempts: int = 10,
        window_seconds: int = 60,
        max_clients: int = 2048,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.max_clients = max_clients
        self._lock = threading.Lock()
        self._attempts: dict[str, list[float]] = {}

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_seconds
        stale = [client for client, stamps in self._attempts.items() if stamps[-1] <= cutoff]
        for client in stale:
            self._attempts.pop(client, None)
        if len(self._attempts) <= self.max_clients:
            return
        ordered = sorted(self._attempts.items(), key=lambda item: item[1][-1])
        for client, _ in ordered[: len(self._attempts) - self.max_clients]:
            self._attempts.pop(client, None)

    def retry_after(self, client: str) -> int:
        """0 berarti boleh mencoba; selain itu detik sampai boleh coba lagi."""
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            stamps = self._attempts.get(client)
            if not stamps:
                return 0
            cutoff = now - self.window_seconds
            stamps = [stamp for stamp in stamps if stamp > cutoff]
            if not stamps:
                self._attempts.pop(client, None)
                return 0
            self._attempts[client] = stamps
            if len(stamps) < self.max_attempts:
                return 0
            return max(1, int(stamps[0] + self.window_seconds - now) + 1)

    def register_failure(self, client: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            self._attempts.setdefault(client, []).append(now)

    def record(self, client: str) -> None:
        """Catat satu pemakaian (dipakai juga untuk pembatas endpoint lain)."""
        self.register_failure(client)

    def reset(self, client: str) -> None:
        with self._lock:
            self._attempts.pop(client, None)


def require_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    expected = getattr(request.app.state, "admin_token", "")
    candidate = credentials.credentials if credentials is not None else ""
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not compare_admin_tokens(candidate.strip(), expected)
    ):
        raise HTTPException(
            status_code=401,
            detail="Admin token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )
