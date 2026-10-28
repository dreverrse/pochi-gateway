import asyncio
import json
import logging
from datetime import datetime, timezone

from app.db import workflow_repository
from app.services import workflows as workflow_service

logger = logging.getLogger(__name__)

POLL_SECONDS = 30


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def run_due_workflows() -> None:
    now = datetime.now(timezone.utc)
    for workflow in workflow_repository.list_enabled_schedules():
        try:
            definition = json.loads(workflow["definition"])
        except (TypeError, ValueError):
            continue
        interval = workflow_service.schedule_interval(definition)
        if not interval:
            continue

        runs = workflow_repository.list_runs(workflow["id"], 1)
        last_started = _parse_timestamp(runs[0]["started_at"]) if runs else None
        if last_started and (now - last_started).total_seconds() < interval:
            continue

        try:
            workflow_service.run_workflow(
                workflow,
                "schedule",
                {"scheduled_at": now.isoformat(timespec="seconds")},
            )
        except Exception:
            logger.exception("Workflow schedule %s gagal", workflow["id"])


async def scheduler_loop() -> None:
    while True:
        try:
            await asyncio.sleep(POLL_SECONDS)
            await asyncio.to_thread(run_due_workflows)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Workflow scheduler error")
