from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.project_state import SemanticChangeGroup
from app.services.constitution_service import ConstitutionService


class ChangeAnalyzer:
    """Groups related commits, PRs, decisions, and meeting actions into high-level semantic changes."""

    COLLECTION_NAME = "semantic_changes"

    async def analyze_and_group_changes(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> list[SemanticChangeGroup]:
        """Aggregate recent development activity into grouped semantic changes."""
        groups: list[SemanticChangeGroup] = []
        now = datetime.now(timezone.utc)

        # 1. Constitution Changes & Version Evolution
        const_doc = await ConstitutionService.get_or_create_constitution(db, project_id, "system")
        if const_doc:
            c_tech = const_doc.sections.technology
            langs = ", ".join(c_tech.languages) if c_tech.languages else "Modern Stack"
            groups.append(
                SemanticChangeGroup(
                    id=str(ObjectId()),
                    group_id=f"change_const_v{const_doc.version}_{project_id}",
                    project_id=project_id,
                    title=f"Constitution v{const_doc.version} Governance Active",
                    summary=f"Enforcing authoritative rules for {langs}, {const_doc.sections.architecture.style or 'REST'} architecture, and branch workflows.",
                    related_commit_shas=[],
                    related_pr_numbers=[],
                    timestamp=const_doc.updated_at if isinstance(const_doc.updated_at, datetime) else now,
                    area="Architecture & Governance",
                )
            )

        # 2. Decision Intelligence Logs & Conflict Detections
        cursor_dec = db["decisions"].find({"project_id": project_id}).sort("timestamp", -1).limit(10)
        decisions = await cursor_dec.to_list(length=10)
        for d in decisions:
            d_status = d.get("status", "ACTIVE")
            d_text = d.get("decision_text", "")
            d_ts = d.get("timestamp") or d.get("extracted_at") or now
            status_tag = " [CONFLICT DETECTED]" if d_status == "CONFLICTED" else ""
            groups.append(
                SemanticChangeGroup(
                    id=str(ObjectId()),
                    group_id=f"change_dec_{d.get('decision_id')}",
                    project_id=project_id,
                    title=f"Architectural Decision: {d_text[:80]}{status_tag}",
                    summary=f"Reasoning: {d.get('reasoning', 'Recorded for project consistency')[:250]}. Status: {d_status}.",
                    related_commit_shas=[],
                    related_pr_numbers=[],
                    timestamp=d_ts if isinstance(d_ts, datetime) else now,
                    area="Decisions & Conflicts",
                )
            )

        # 3. Find recent finalized meetings
        cursor_m = db["meetings"].find({"project_id": project_id, "status": "ENDED"}).sort("ended_at", -1).limit(5)
        meetings = await cursor_m.to_list(length=5)
        for m in meetings:
            m_title = m.get("title", "Team Meeting")
            summary_doc = await db["meeting_summaries"].find_one({"meeting_id": m.get("meeting_id")})
            overview = summary_doc.get("overview", "") if summary_doc else f"Concluded {m_title}."
            m_ts = m.get("ended_at") or m.get("created_at") or now
            groups.append(
                SemanticChangeGroup(
                    id=str(ObjectId()),
                    group_id=f"change_meet_{m.get('meeting_id')}",
                    project_id=project_id,
                    title=f"Team Alignment: {m_title}",
                    summary=overview[:300],
                    related_commit_shas=[],
                    related_pr_numbers=[],
                    timestamp=m_ts if isinstance(m_ts, datetime) else now,
                    area="Meetings & Collaboration",
                )
            )

        # 4. Find completed action items
        cursor_a = db["action_items"].find({"project_id": project_id, "status": "DONE"}).sort("completed_at", -1).limit(10)
        done_actions = await cursor_a.to_list(length=10)
        if done_actions:
            titles = [a.get("title") for a in done_actions if a.get("title")]
            groups.append(
                SemanticChangeGroup(
                    id=str(ObjectId()),
                    group_id=f"change_actions_{project_id}",
                    project_id=project_id,
                    title=f"Completed {len(done_actions)} Project Action Item(s)",
                    summary="Delivered milestones: " + "; ".join(titles[:5]),
                    related_commit_shas=[],
                    related_pr_numbers=[],
                    timestamp=done_actions[0].get("completed_at") or now,
                    area="Tasks & Execution",
                )
            )

        # 5. Ingestion Chunks / GitHub Sync Milestone
        project_doc = await db["projects"].find_one({"project_id": project_id})
        if project_doc and project_doc.get("github_repo_name"):
            repo = project_doc.get("github_repo_name")
            chunks = project_doc.get("ingestion_status", {}).get("github_chunks_count", 0)
            groups.append(
                SemanticChangeGroup(
                    id=str(ObjectId()),
                    group_id=f"change_github_{project_id}",
                    project_id=project_id,
                    title=f"Repository Ingestion: {repo}",
                    summary=f"Indexed {chunks} semantic code chunks into vector search and knowledge graph.",
                    related_commit_shas=[],
                    related_pr_numbers=[],
                    timestamp=now,
                    area="Code & Ingestion",
                )
            )

        # Cache/upsert groups without modifying immutable _id
        for g in groups:
            g_data = g.model_dump(by_alias=True)
            g_data.pop("_id", None)
            await db[self.COLLECTION_NAME].update_one(
                {"group_id": g.group_id, "project_id": project_id},
                {"$set": g_data},
                upsert=True,
            )

        # Return latest sorted with defensive parsing
        cursor_res = db[self.COLLECTION_NAME].find({"project_id": project_id}).sort("timestamp", -1).limit(25)
        docs = await cursor_res.to_list(length=25)
        
        parsed_groups: list[SemanticChangeGroup] = []
        for d in docs:
            try:
                if "_id" in d:
                    d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d.get("_id", str(ObjectId()))
                ts = d.get("timestamp")
                if isinstance(ts, str):
                    d["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                parsed_groups.append(SemanticChangeGroup(**d))
            except Exception:
                pass

        return parsed_groups if parsed_groups else groups


