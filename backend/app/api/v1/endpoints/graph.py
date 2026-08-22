from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.api.v1.permissions import ProjectContext, require_project_member
from app.models.decision import DecisionModel
from app.services.architecture_service import build_project_architecture_graph

router = APIRouter()


@router.get("/{project_id}/graph")
async def get_project_graph(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Build a lightweight nodes/edges graph from existing decisions data.
    No new ingestion — pure aggregation over the decisions collection.
    """
    target_pid = ctx.project.project_id or project_id
    cursor = ctx.db["decisions"].find({"project_id": target_pid})
    decisions = [DecisionModel(**doc) async for doc in cursor]

    nodes: list[dict] = []
    edges: list[dict] = []

    seen_source_nodes: set[str] = set()
    seen_person_nodes: set[str] = set()

    for d in decisions:
        decision_node_id = f"decision:{d.decision_id}"
        nodes.append({
            "id": decision_node_id,
            "type": "decision",
            "label": (d.decision_text[:80] + "…") if len(d.decision_text) > 80 else d.decision_text,
            "confidence_score": d.confidence_score,
        })

        # Source node (github_file / discord_message / etc.)
        if d.source_id:
            source_node_id = f"source:{d.source_type}:{d.source_id}"
            if source_node_id not in seen_source_nodes:
                seen_source_nodes.add(source_node_id)
                nodes.append({
                    "id": source_node_id,
                    "type": d.source_type or "unknown",
                    "label": d.source_id,
                })
            edges.append({
                "id": f"{decision_node_id}->{source_node_id}",
                "source": decision_node_id,
                "target": source_node_id,
                "relation": "derived_from",
            })

        # Participant nodes
        for participant in d.participants:
            person_node_id = f"person:{participant}"
            if person_node_id not in seen_person_nodes:
                seen_person_nodes.add(person_node_id)
                nodes.append({
                    "id": person_node_id,
                    "type": "person",
                    "label": participant,
                })
            edges.append({
                "id": f"{decision_node_id}->{person_node_id}",
                "source": decision_node_id,
                "target": person_node_id,
                "relation": "involved",
            })

    return {"nodes": nodes, "edges": edges}


@router.get("/{project_id}/architecture")
async def get_project_architecture(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Dynamically generates the 4-Tier software architecture topology of the specified project.
    Synthesizes the Project Constitution, decisions, database rules, and service boundaries.
    """
    target_pid = ctx.project.project_id or project_id
    return await build_project_architecture_graph(target_pid, db)

