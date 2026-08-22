from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Optional, Any
from bson import ObjectId
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict


PyObjectId = Annotated[str, BeforeValidator(lambda x: str(x) if isinstance(x, ObjectId) else str(x))]


class HealthStatus(str, Enum):
    HEALTHY = "HEALTHY"
    ATTENTION = "ATTENTION"
    AT_RISK = "AT_RISK"
    UNKNOWN = "UNKNOWN"


class RiskSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class ConsistencyIssueType(str, Enum):
    DECISION_VS_CODE = "DECISION_VS_CODE"
    CONSTITUTION_VS_CODE = "CONSTITUTION_VS_CODE"
    DOCUMENTATION_DRIFT = "DOCUMENTATION_DRIFT"
    DECISION_STALENESS = "DECISION_STALENESS"


class ProjectStateSnapshot(BaseModel):
    """Point-in-time derived state of a Forge project."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    snapshot_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    project_summary: str
    current_phase: str = "UNKNOWN"
    active_work: list[str] = Field(default_factory=list)
    completed_work: list[str] = Field(default_factory=list)
    blocked_work: list[str] = Field(default_factory=list)
    technical_stack: dict[str, list[str]] = Field(default_factory=dict)
    active_decisions_count: int = 0
    open_action_items_count: int = 0
    overdue_action_items_count: int = 0
    health_status: str = HealthStatus.HEALTHY.value
    health_reasons: list[str] = Field(default_factory=list)
    confidence: str = "HIGH"


class ProjectRisk(BaseModel):
    """Evidence-based project risk or blocker."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    risk_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    title: str
    impact_explanation: str
    severity: str = RiskSeverity.MEDIUM.value
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = RiskStatus.OPEN.value


class ConsistencyIssue(BaseModel):
    """Identified inconsistency between documented rules/decisions and codebase evidence."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    issue_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    issue_type: str = ConsistencyIssueType.DECISION_VS_CODE.value
    title: str
    description: str
    documented_claim: str
    observed_evidence: str
    confidence: str = "HIGH"
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KnowledgeGap(BaseModel):
    """Area where Forge lacks sufficient project documentation or architecture records."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    gap_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    area: str
    description: str
    suggested_action: str
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectTimelineEvent(BaseModel):
    """Unified chronological project event with provenance."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    event_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    event_type: str = "GENERAL"  # DECISION, MEETING, COMMIT, PR, ACTION_ITEM, CONSTITUTION, GITHUB
    source_id: Optional[str] = ""
    title: str = "Project Event"
    description: Optional[str] = ""
    author: Optional[str] = "System"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)


class SemanticChangeGroup(BaseModel):
    """High-level semantic development change grouping related commits and PRs."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    group_id: str = Field(default_factory=lambda: str(ObjectId()))
    project_id: str
    title: str = "Development Change"
    summary: str = ""
    related_commit_shas: list[str] = Field(default_factory=list)
    related_pr_numbers: list[int] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    area: str = "General"


# API Request / Response Schemas
class UpdateRiskRequest(BaseModel):
    status: str  # OPEN, ACKNOWLEDGED, RESOLVED

