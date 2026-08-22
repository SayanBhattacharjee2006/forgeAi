from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.project_state import (
    ProjectRisk,
    RiskSeverity,
    RiskStatus,
    KnowledgeGap,
)
from app.services.constitution_service import ConstitutionService


class RiskAndGapAnalyzer:
    """Identifies evidence-based project risks, blockers, and knowledge gaps."""

    RISKS_COLLECTION = "project_risks"
    GAPS_COLLECTION = "project_knowledge_gaps"

    async def analyze_risks_and_gaps(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> tuple[list[ProjectRisk], list[KnowledgeGap]]:
        """Identify actionable risks, blockers, and knowledge gaps from project evidence."""
        risks: list[ProjectRisk] = []
        gaps: list[KnowledgeGap] = []
        now = datetime.now(timezone.utc)

        # 1. Check for Conflicting Decisions (High Severity Risk)
        cursor_conflicts = db["decisions"].find({"project_id": project_id, "status": "CONFLICTED"})
        conflicts = await cursor_conflicts.to_list(length=10)
        for conf in conflicts:
            conflict_details = await db["decision_conflicts"].find_one({
                "project_id": project_id,
                "$or": [{"decision_id_a": conf.get("decision_id")}, {"decision_id_b": conf.get("decision_id")}],
            })
            explanation = conflict_details.get("explanation") if conflict_details else "Contradicts active Project Constitution or decision records."
            risks.append(
                ProjectRisk(
                    id=str(ObjectId()),
                    risk_id=f"risk_conflict_{conf.get('decision_id')}",
                    project_id=project_id,
                    title=f"Architectural Conflict: {conf.get('decision_text', '')[:70]}",
                    impact_explanation=f"Conflicting decisions introduce contradictory implementation standards across team members. Details: {explanation}",
                    severity=RiskSeverity.HIGH.value,
                    evidence=[
                        {
                            "source_type": "decision",
                            "source_id": conf.get("decision_id"),
                            "status": "CONFLICTED",
                            "decision_text": conf.get("decision_text"),
                        }
                    ],
                    detected_at=now,
                    status=RiskStatus.OPEN.value,
                )
            )

        # 2. Check for Project Constitution Completeness & Gaps
        constitution = await ConstitutionService.get_or_create_constitution(db, project_id, "system")
        c_tech = constitution.sections.technology
        c_arch = constitution.sections.architecture
        c_git = constitution.sections.git_workflow

        if not c_tech.databases:
            gaps.append(
                KnowledgeGap(
                    id=str(ObjectId()),
                    gap_id=f"gap_no_db_{project_id}",
                    project_id=project_id,
                    area="Database Architecture",
                    description="Project Constitution does not specify primary operational or caching databases.",
                    suggested_action="Specify database technologies in the Project Constitution (e.g. MongoDB, Redis).",
                    detected_at=now,
                )
            )

        if not c_arch.rules:
            gaps.append(
                KnowledgeGap(
                    id=str(ObjectId()),
                    gap_id=f"gap_no_arch_rules_{project_id}",
                    project_id=project_id,
                    area="Architecture Guidelines",
                    description="No core architecture rules or patterns are codified in Section 2 of the Constitution.",
                    suggested_action="Define layered architecture rules (e.g., repository pattern, dependency injection).",
                    detected_at=now,
                )
            )

        if not c_git.branch_naming:
            gaps.append(
                KnowledgeGap(
                    id=str(ObjectId()),
                    gap_id=f"gap_no_git_rules_{project_id}",
                    project_id=project_id,
                    area="Git Workflow",
                    description="Branch naming conventions and merge strategies are unconfigured.",
                    suggested_action="Document feature/bugfix branch patterns and merge policies.",
                    detected_at=now,
                )
            )

        # 3. Check for Disconnected Ingestion Sources
        project_doc = await db["projects"].find_one({"project_id": project_id})
        if project_doc:
            if not project_doc.get("github_repo_name") and not project_doc.get("github_repo_url"):
                risks.append(
                    ProjectRisk(
                        id=str(ObjectId()),
                        risk_id=f"risk_no_github_{project_id}",
                        project_id=project_id,
                        title="GitHub Repository Disconnected",
                        impact_explanation="Without a connected GitHub repository, Forge AI cannot analyze code diffs, semantic chunks, or pull request drift.",
                        severity=RiskSeverity.MEDIUM.value,
                        evidence=[{"source_type": "project_settings", "field": "github_repo_name", "value": None}],
                        detected_at=now,
                        status=RiskStatus.OPEN.value,
                    )
                )

            if not project_doc.get("discord_guild_id"):
                gaps.append(
                    KnowledgeGap(
                        id=str(ObjectId()),
                        gap_id=f"gap_no_discord_{project_id}",
                        project_id=project_id,
                        area="Team Communication Integration",
                        description="Discord server is not connected for live team chat and voice meeting ingestion.",
                        suggested_action="Connect Discord Guild in Project Overview settings to capture real-time team discussions.",
                        detected_at=now,
                    )
                )

        # 4. Analyze Action Items for Blockers and Overdue Tasks
        cursor_actions = db["action_items"].find({"project_id": project_id})
        actions = await cursor_actions.to_list(length=50)

        for act in actions:
            status = act.get("status", "TODO")
            title = act.get("title", "")
            desc = act.get("description", "")
            due_at = act.get("due_at")

            if "blocked" in title.lower() or "blocked" in desc.lower():
                risks.append(
                    ProjectRisk(
                        id=str(ObjectId()),
                        risk_id=f"risk_blocked_{act.get('action_id')}",
                        project_id=project_id,
                        title=f"Blocked Action Item: {title}",
                        impact_explanation="A critical project milestone has been flagged as blocked in action item records.",
                        severity=RiskSeverity.HIGH.value,
                        evidence=[{"source_type": "action_item", "source_id": act.get("action_id"), "title": title}],
                        detected_at=now,
                        status=RiskStatus.OPEN.value,
                    )
                )

            if status in ["TODO", "IN_PROGRESS"] and due_at:
                try:
                    due_dt = due_at if isinstance(due_at, datetime) else datetime.fromisoformat(str(due_at))
                    if due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                    if due_dt < now:
                        risks.append(
                            ProjectRisk(
                                id=str(ObjectId()),
                                risk_id=f"risk_overdue_{act.get('action_id')}",
                                project_id=project_id,
                                title=f"Overdue Task: {title}",
                                impact_explanation=f"Task target date ({due_dt.strftime('%b %d, %Y')}) has passed without completion.",
                                severity=RiskSeverity.LOW.value,
                                evidence=[{"source_type": "action_item", "source_id": act.get("action_id"), "due_at": due_dt.isoformat()}],
                                detected_at=now,
                                status=RiskStatus.OPEN.value,
                            )
                        )
                except Exception:
                    pass

        # Deduplicate risks and gaps by ID
        unique_risks: list[ProjectRisk] = []
        seen_risk_ids: set[str] = set()
        for r in risks:
            if r.risk_id not in seen_risk_ids:
                seen_risk_ids.add(r.risk_id)
                unique_risks.append(r)
        risks = unique_risks

        unique_gaps: list[KnowledgeGap] = []
        seen_gap_ids: set[str] = set()
        for g in gaps:
            if g.gap_id not in seen_gap_ids:
                seen_gap_ids.add(g.gap_id)
                unique_gaps.append(g)
        gaps = unique_gaps

        # Clear old and upsert fresh records
        await db[self.RISKS_COLLECTION].delete_many({"project_id": project_id})
        for r in risks:
            r_data = r.model_dump(by_alias=True)
            r_data.pop("_id", None)
            await db[self.RISKS_COLLECTION].insert_one(r_data)

        await db[self.GAPS_COLLECTION].delete_many({"project_id": project_id})
        for g in gaps:
            g_data = g.model_dump(by_alias=True)
            g_data.pop("_id", None)
            await db[self.GAPS_COLLECTION].insert_one(g_data)

        cursor_r = db[self.RISKS_COLLECTION].find({"project_id": project_id}).sort("detected_at", -1)
        r_docs = await cursor_r.to_list(length=50)

        cursor_g = db[self.GAPS_COLLECTION].find({"project_id": project_id}).sort("detected_at", -1)
        g_docs = await cursor_g.to_list(length=50)


        parsed_risks: list[ProjectRisk] = []
        for d in r_docs:
            try:
                if "_id" in d:
                    d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d.get("_id", str(ObjectId()))
                ts = d.get("detected_at")
                if isinstance(ts, str):
                    d["detected_at"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                parsed_risks.append(ProjectRisk(**d))
            except Exception:
                pass

        parsed_gaps: list[KnowledgeGap] = []
        for d in g_docs:
            try:
                if "_id" in d:
                    d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d.get("_id", str(ObjectId()))
                ts = d.get("detected_at")
                if isinstance(ts, str):
                    d["detected_at"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                parsed_gaps.append(KnowledgeGap(**d))
            except Exception:
                pass

        return (
            parsed_risks if parsed_risks else risks,
            parsed_gaps if parsed_gaps else gaps,
        )

    async def update_risk_status(
        self, project_id: str, risk_id: str, new_status: str, db: AsyncIOMotorDatabase
    ) -> bool:
        """Update the status of an existing risk."""
        res = await db[self.RISKS_COLLECTION].update_one(
            {"project_id": project_id, "risk_id": risk_id},
            {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}},
        )
        return res.modified_count > 0
