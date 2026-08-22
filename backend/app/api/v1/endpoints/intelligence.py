import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.api.v1.permissions import require_project_member, ProjectContext
from app.models.project_state import (
    ProjectStateSnapshot,
    ProjectRisk,
    ConsistencyIssue,
    KnowledgeGap,
    ProjectTimelineEvent,
    SemanticChangeGroup,
    UpdateRiskRequest,
)
from app.services.intelligence.orchestrator import ProjectIntelligenceOrchestrator

logger = logging.getLogger(__name__)
router = APIRouter()
orchestrator = ProjectIntelligenceOrchestrator()


@router.get("/projects/{project_id}/intelligence/state", response_model=ProjectStateSnapshot)
async def get_project_state(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get the latest derived point-in-time state of the project."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_project_state(target_pid, db)
    except Exception as e:
        logger.error(f"[get_project_state error] {e}", exc_info=True)
        return await orchestrator.state_analyzer.analyze_project_state(target_pid, db)


@router.post("/projects/{project_id}/intelligence/refresh", response_model=ProjectStateSnapshot)
async def refresh_project_intelligence(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Trigger a fresh cross-system intelligence analysis for the project."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.refresh_full_intelligence(target_pid, db)
    except Exception as e:
        logger.error(f"[refresh_project_intelligence error] {e}", exc_info=True)
        return await orchestrator.state_analyzer.analyze_project_state(target_pid, db)


@router.get("/projects/{project_id}/intelligence/timeline", response_model=list[ProjectTimelineEvent])
async def get_project_timeline(
    project_id: str,
    event_type: Optional[str] = Query(None, alias="type"),
    limit: int = Query(50, ge=1, le=200),
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get chronological multi-source project timeline."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_timeline(
            project_id=target_pid,
            event_type_filter=event_type,
            limit=limit,
            db=db,
        )
    except Exception as e:
        logger.error(f"[get_project_timeline error] {e}", exc_info=True)
        return []


@router.get("/projects/{project_id}/intelligence/changes", response_model=list[SemanticChangeGroup])
async def get_recent_changes(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get grouped semantic development changes."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_recent_changes(target_pid, db)
    except Exception as e:
        logger.error(f"[get_recent_changes error] {e}", exc_info=True)
        return []


@router.get("/projects/{project_id}/intelligence/risks", response_model=list[ProjectRisk])
async def get_project_risks(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get identified project risks and blockers."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_risks(target_pid, db)
    except Exception as e:
        logger.error(f"[get_project_risks error] {e}", exc_info=True)
        return []


@router.patch("/projects/{project_id}/intelligence/risks/{risk_id}", response_model=dict)
async def update_risk_status(
    project_id: str,
    risk_id: str,
    body: UpdateRiskRequest,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update risk status (OPEN, ACKNOWLEDGED, RESOLVED)."""
    target_pid = context.project.project_id or project_id
    success = await orchestrator.update_risk_status(
        project_id=target_pid,
        risk_id=risk_id,
        new_status=body.status,
        db=db,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
    return {"status": "success", "risk_id": risk_id, "new_status": body.status}


@router.get("/projects/{project_id}/intelligence/consistency", response_model=list[ConsistencyIssue])
async def get_consistency_issues(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get detected inconsistencies between decisions, constitution, and code."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_consistency_issues(target_pid, db)
    except Exception as e:
        logger.error(f"[get_consistency_issues error] {e}", exc_info=True)
        return []


@router.get("/projects/{project_id}/intelligence/gaps", response_model=list[KnowledgeGap])
async def get_knowledge_gaps(
    project_id: str,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get identified project knowledge gaps."""
    target_pid = context.project.project_id or project_id
    try:
        return await orchestrator.get_knowledge_gaps(target_pid, db)
    except Exception as e:
        logger.error(f"[get_knowledge_gaps error] {e}", exc_info=True)
        return []

