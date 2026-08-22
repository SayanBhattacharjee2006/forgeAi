from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.permissions import ProjectContext, require_project_member
from app.models.decision import (
    DecisionModel,
    DecisionResponse,
    ConflictInfo,
    DecisionStatusUpdate,
    DecisionStatus,
)
from app.services.decision_service import DecisionService

router = APIRouter()
decision_service = DecisionService()


@router.post("/{project_id}/decisions/extract")
async def extract_decisions(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Trigger non-destructive AI extraction of decisions from the project knowledge base."""
    project = ctx.project
    if not project.qdrant_collection_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No knowledge base available for this project",
        )

    decisions = await decision_service.extract_decisions(
        project_id=project_id,
        collection_name=project.qdrant_collection_name,
        db=ctx.db,
    )

    return {
        "message": f"Extracted and reconciled {len(decisions)} decisions",
        "count": len(decisions),
    }


@router.post("/{project_id}/decisions/detect-conflicts")
async def detect_conflicts(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Run pairwise conflict detection across all decisions for this project."""
    conflicts = await decision_service.detect_conflicts(project_id=project_id, db=ctx.db)
    return {
        "message": f"Conflict detection complete. Identified {len(conflicts)} relationships.",
        "count": len(conflicts),
    }


@router.get("/{project_id}/decisions", response_model=list[DecisionResponse])
async def list_decisions(
    project_id: str,
    status_filter: Optional[str] = Query(default="all", description="all | active | superseded | conflicted"),
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get all decisions for a project with conflict and supersession relationships attached."""
    query: dict = {"project_id": project_id}
    if status_filter and status_filter.lower() != "all":
        query["status"] = status_filter.upper()

    cursor = ctx.db["decisions"].find(query).sort([("timestamp", -1), ("confidence_score", -1)])
    decisions = [DecisionModel(**doc) async for doc in cursor]
    decision_text_map = {d.decision_id: d.decision_text for d in decisions}

    # Fetch conflicts for this project
    conflict_cursor = ctx.db["decision_conflicts"].find({"project_id": project_id})
    conflicts_by_decision: dict[str, list[ConflictInfo]] = {}
    async for c in conflict_cursor:
        for this_id, other_id in [
            (c["decision_id_a"], c["decision_id_b"]),
            (c["decision_id_b"], c["decision_id_a"]),
        ]:
            other_text = decision_text_map.get(other_id)
            if not other_text:
                if other_id.startswith("constitution:"):
                    other_text = "Project Constitution (Authoritative Rules)"
                else:
                    other_text = other_id

            conflicts_by_decision.setdefault(this_id, []).append(
                ConflictInfo(
                    other_decision_id=other_id,
                    other_decision_text=other_text,
                    relationship=c.get("relationship", "conflict"),
                    explanation=c.get("explanation", ""),
                )
            )

    result = []
    for d in decisions:
        conflicts = conflicts_by_decision.get(d.decision_id, [])
        # Also attach supersession pointer if available
        if d.superseded_by and not any(c.other_decision_id == d.superseded_by for c in conflicts):
            conflicts.append(
                ConflictInfo(
                    other_decision_id=d.superseded_by,
                    other_decision_text=decision_text_map.get(d.superseded_by, d.superseded_by),
                    relationship="superseded_by",
                    explanation="Superseded by newer decision",
                )
            )
        if d.supersedes and not any(c.other_decision_id == d.supersedes for c in conflicts):
            conflicts.append(
                ConflictInfo(
                    other_decision_id=d.supersedes,
                    other_decision_text=decision_text_map.get(d.supersedes, d.supersedes),
                    relationship="supersedes",
                    explanation="Replaces older decision",
                )
            )

        dumped = d.model_dump(exclude={"conflict_ids"})
        response = DecisionResponse(
            **dumped,
            conflicts=conflicts,
        )
        result.append(response)

    return result


@router.get("/{project_id}/decisions/{decision_id}", response_model=DecisionResponse)
async def get_decision(
    project_id: str,
    decision_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get a specific project decision by ID."""
    doc = await ctx.db["decisions"].find_one({"project_id": project_id, "decision_id": decision_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")

    decision = DecisionModel(**doc)
    conflict_cursor = ctx.db["decision_conflicts"].find({
        "project_id": project_id,
        "$or": [{"decision_id_a": decision_id}, {"decision_id_b": decision_id}],
    })
    conflicts = []
    async for c in conflict_cursor:
        other_id = c["decision_id_b"] if c["decision_id_a"] == decision_id else c["decision_id_a"]
        other_doc = await ctx.db["decisions"].find_one({"project_id": project_id, "decision_id": other_id})
        conflicts.append(
            ConflictInfo(
                other_decision_id=other_id,
                other_decision_text=other_doc.get("decision_text", other_id) if other_doc else other_id,
                relationship=c.get("relationship", "conflict"),
                explanation=c.get("explanation", ""),
            )
        )

    dumped = decision.model_dump(exclude={"conflict_ids"})
    return DecisionResponse(**dumped, conflicts=conflicts)


@router.put("/{project_id}/decisions/{decision_id}/status")
async def update_decision_status(
    project_id: str,
    decision_id: str,
    body: DecisionStatusUpdate,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Update a decision's status (e.g. resolve conflict, mark active or superseded)."""
    valid_statuses = {s.value for s in DecisionStatus}
    new_status = body.status.upper()
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    res = await ctx.db["decisions"].update_one(
        {"project_id": project_id, "decision_id": decision_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")

    # If resolving conflict to ACTIVE, remove from decision_conflicts
    if new_status == DecisionStatus.ACTIVE.value:
        await ctx.db["decision_conflicts"].delete_many({
            "project_id": project_id,
            "$or": [{"decision_id_a": decision_id}, {"decision_id_b": decision_id}],
        })

    return {"message": f"Decision status updated to {new_status}", "decision_id": decision_id, "status": new_status}
