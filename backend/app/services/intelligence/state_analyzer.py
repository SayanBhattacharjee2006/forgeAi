from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.project_state import ProjectStateSnapshot, HealthStatus
from app.services.constitution_service import ConstitutionService


class ProjectStateAnalyzer:
    """Derives point-in-time ProjectStateSnapshot from cross-system project evidence."""

    COLLECTION_NAME = "project_state_snapshots"

    async def analyze_project_state(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> ProjectStateSnapshot:
        """Construct evidence-based point-in-time ProjectStateSnapshot."""
        now = datetime.now(timezone.utc)

        # 1. Fetch project & constitution
        project_doc = await db["projects"].find_one({"project_id": project_id})
        project_name = project_doc.get("name", "Project") if project_doc else "Project"

        constitution = await ConstitutionService.get_or_create_constitution(
            db=db, project_id=project_id, user_id="system"
        )
        tech_stack = {
            "languages": constitution.sections.technology.languages or [],
            "frameworks": constitution.sections.technology.frameworks or [],
            "databases": constitution.sections.technology.databases or [],
            "infrastructure": constitution.sections.technology.infrastructure or [],
        }

        # 2. Fetch Decisions & Conflicts
        dec_cursor = db["decisions"].find({"project_id": project_id})
        decisions = await dec_cursor.to_list(length=100)
        active_decisions = [d for d in decisions if d.get("status") == "ACTIVE"]
        conflicted_decisions = [d for d in decisions if d.get("status") == "CONFLICTED"]

        # 3. Fetch Action Items
        act_cursor = db["action_items"].find({"project_id": project_id})
        actions = await act_cursor.to_list(length=100)

        open_actions = [a for a in actions if a.get("status") in ["TODO", "IN_PROGRESS"]]
        completed_actions = [a for a in actions if a.get("status") == "DONE"]
        blocked_actions = [
            a.get("title") for a in actions
            if "blocked" in a.get("title", "").lower() or "blocked" in a.get("description", "").lower()
        ]

        overdue_actions = []
        for a in open_actions:
            due = a.get("due_at")
            if due:
                try:
                    due_dt = due if isinstance(due, datetime) else datetime.fromisoformat(str(due))
                    if due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                    if due_dt < now:
                        overdue_actions.append(a.get("title"))
                except Exception:
                    pass

        # 4. Fetch Ingestion & Chat metrics
        chat_count = await db["chat_messages"].count_documents({"project_id": project_id})
        meetings_count = await db["meetings"].count_documents({"project_id": project_id})
        github_chunks = project_doc.get("ingestion_status", {}).get("github_chunks_count", 0) if project_doc else 0

        # 5. Derive Active & Completed Work
        active_work = [a.get("title") for a in open_actions[:4] if a.get("title")]
        if not active_work and active_decisions:
            active_work = [f"Enforcing: {d.get('decision_text')}" for d in active_decisions[:3]]
        if not active_work:
            active_work = [
                f"Architecture alignment on {', '.join(tech_stack['frameworks'] or ['Core Stack'])}",
                f"Constitution v{constitution.version} governance active",
            ]

        completed_work = [a.get("title") for a in completed_actions[:3] if a.get("title")]
        for d in active_decisions[:4]:
            if len(completed_work) < 6:
                completed_work.append(f"Architectural Agreement: {d.get('decision_text')}")
        if not completed_work:
            completed_work = [f"Project Constitution established with {len(tech_stack['languages'])} language(s)"]

        # Phase inference heuristic
        phase = "Active Architecture & Implementation"
        all_text = " ".join(active_work + completed_work).lower()
        if "rag" in all_text or "retrieval" in all_text or "qdrant" in all_text:
            phase = "RAG & Vector Retrieval Pipeline"
        elif "voice" in all_text or "meeting" in all_text or meetings_count > 0:
            phase = "Collaborative Execution & Meetings"
        elif conflicted_decisions:
            phase = "Architecture Conflict Arbitration"
        elif constitution.version > 1:
            phase = "Iterative Evolution & Scaling"

        # 6. Determine Health Status with Explainable Reasons
        health_reasons = []
        if len(blocked_actions) > 0:
            health_status = HealthStatus.AT_RISK.value
            health_reasons.append(f"{len(blocked_actions)} critical action item(s) flagged as blocked.")
        elif len(conflicted_decisions) > 0:
            health_status = HealthStatus.ATTENTION.value
            health_reasons.append(f"{len(conflicted_decisions)} architectural decision conflict(s) require review in Decision Log.")
        elif len(overdue_actions) > 0:
            health_status = HealthStatus.ATTENTION.value
            health_reasons.append(f"{len(overdue_actions)} action item(s) are past target deadline.")
        elif not tech_stack["frameworks"] and not tech_stack["databases"]:
            health_status = HealthStatus.ATTENTION.value
            health_reasons.append("Project Constitution tech stack is partially underspecified.")
        else:
            health_status = HealthStatus.HEALTHY.value
            health_reasons.append(f"Architecture aligned with Project Constitution v{constitution.version}; 0 active conflicts.")

        # 7. Generate Project Executive Summary
        summary = (
            f"Project '{project_name}' is operating in the '{phase}' phase under Constitution v{constitution.version}. "
            f"Currently tracking {len(active_decisions)} active decision(s), {len(conflicted_decisions)} conflict(s), "
            f"{chat_count} team message(s), and {github_chunks} indexed code chunk(s)."
        )
        if health_reasons:
            summary += f" Diagnostic: {health_reasons[0]}"

        snapshot = ProjectStateSnapshot(
            id=str(ObjectId()),
            snapshot_id=f"snap_{project_id}_{int(now.timestamp())}",
            project_id=project_id,
            generated_at=now,
            project_summary=summary,
            current_phase=phase,
            active_work=active_work,
            completed_work=completed_work,
            blocked_work=blocked_actions,
            technical_stack=tech_stack,
            active_decisions_count=len(active_decisions),
            open_action_items_count=len(open_actions),
            overdue_action_items_count=len(overdue_actions),
            health_status=health_status,
            health_reasons=health_reasons,
            confidence="HIGH",
        )

        # Upsert latest snapshot without modifying immutable _id
        doc_data = snapshot.model_dump(by_alias=True)
        doc_data.pop("_id", None)
        await db[self.COLLECTION_NAME].update_one(
            {"project_id": project_id},
            {"$set": doc_data},
            upsert=True,
        )

        from app.services.cache_service import cache_service
        cache_service.set_cached_state_snapshot(project_id, snapshot.model_dump(by_alias=True))
        return snapshot

    async def get_latest_snapshot(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> ProjectStateSnapshot:
        """Get cached snapshot or calculate fresh if none exists."""
        from app.services.cache_service import cache_service
        cached = cache_service.get_cached_state_snapshot(project_id)
        if cached:
            return ProjectStateSnapshot(**cached)

        doc = await db[self.COLLECTION_NAME].find_one({"project_id": project_id})
        if doc:
            return ProjectStateSnapshot(**doc)

        return await self.analyze_project_state(project_id, db)
