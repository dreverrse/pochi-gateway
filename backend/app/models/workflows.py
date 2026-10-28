import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

NodeType = Literal[
    "trigger.manual",
    "trigger.schedule",
    "trigger.webhook",
    "action.chat",
    "action.http",
    "logic.condition",
    "logic.set",
]

Branch = Literal["always", "true", "false"]

NODE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class WorkflowNode(BaseModel):
    id: str
    type: NodeType
    name: str = Field(default="", max_length=80)
    config: dict[str, Any] = Field(default_factory=dict)
    position: NodePosition = Field(default_factory=NodePosition)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not NODE_ID_PATTERN.match(value):
            raise ValueError("ID node hanya boleh huruf kecil, angka, '-' dan '_' (maks 40)")
        return value


class WorkflowEdge(BaseModel):
    id: str = Field(default="", max_length=80)
    source: str
    target: str
    branch: Branch = "always"


class WorkflowDefinition(BaseModel):
    nodes: list[WorkflowNode] = Field(default_factory=list, max_length=40)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=80)


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    enabled: bool = True
    definition: WorkflowDefinition = Field(default_factory=WorkflowDefinition)


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=400)
    enabled: bool | None = None
    definition: WorkflowDefinition | None = None


class WorkflowRunSummary(BaseModel):
    id: int
    status: str
    trigger: str
    started_at: str
    finished_at: str | None
    error: str | None = None


class WorkflowOut(BaseModel):
    id: int
    name: str
    description: str
    enabled: bool
    definition: WorkflowDefinition
    webhook_token: str | None
    created_at: str
    updated_at: str
    last_run: WorkflowRunSummary | None = None


class WorkflowStepOut(BaseModel):
    node_id: str
    node_type: str
    status: str
    output: Any = None
    error: str | None = None
    duration_ms: int


class WorkflowRunOut(BaseModel):
    id: int
    workflow_id: int
    status: str
    trigger: str
    input: Any = None
    output: Any = None
    error: str | None = None
    started_at: str
    finished_at: str | None
    steps: list[WorkflowStepOut] = Field(default_factory=list)


class WorkflowRunRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)

