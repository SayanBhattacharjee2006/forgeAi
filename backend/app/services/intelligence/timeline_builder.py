from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.project_state import ProjectTimelineEvent


class TimelineBuilder:
    """Constructs a unified, queryable chronological project timeline from multiple sources."""

    COLLECTION_NAME = "project_timeline_events"

    async def build_timeline(
        self,
        project_id: str,
        event_type_filter: Optional[str] = None,
        limit: int = 50,
        db: Optional[AsyncIOMotorDatabase] = None,
    ) -> list[ProjectTimelineEvent]:
        """Aggregate chronological project events with full provenance."""
        events: list[ProjectTimelineEvent] = []
        now = datetime.now(timezone.utc)

        # 1. Project Constitution Evolution
        const_doc = await db["project_constitutions"].find_one({"project_id": project_id})
        if const_doc:
            c_ts = const_doc.get("updated_at") or const_doc.get("created_at") or now
            events.append(
                ProjectTimelineEvent(
                    id=str(ObjectId()),
                    event_id=f"timeline_const_v{const_doc.get('version', 1)}_{project_id}",
                    project_id=project_id,
                    event_type="CONSTITUTION",
                    source_id=project_id,
                    title=f"Project Constitution v{const_doc.get('version', 1)} Established",
                    description=f"Standardized technology stack and codified architecture rules for {project_id}.",
                    author=const_doc.get("last_modified_by", "Constitution Service"),
                    timestamp=c_ts if isinstance(c_ts, datetime) else now,
                    metadata={"version": const_doc.get("version", 1)},
                )
            )

        # 2. Project Decisions & Conflicts
        cursor_d = db["decisions"].find({"project_id": project_id}).sort("timestamp", -1).limit(25)
        decisions = await cursor_d.to_list(length=25)
        for d in decisions:
            ts = d.get("timestamp") or d.get("extracted_at") or now
            d_status = d.get("status", "ACTIVE")
            is_conflicted = d_status == "CONFLICTED"
            events.append(
                ProjectTimelineEvent(
                    id=str(ObjectId()),
                    event_id=f"timeline_dec_{d.get('decision_id')}",
                    project_id=project_id,
                    event_type="DECISION",
                    source_id=d.get("decision_id"),
                    title=f"{'⚠️ Conflict: ' if is_conflicted else 'Decision: '}{d.get('decision_text', '')[:90]}",
                    description=d.get("reasoning", "")[:220],
                    author=d.get("author", "Decision Intelligence"),
                    timestamp=ts if isinstance(ts, datetime) else now,
                    metadata={"status": d_status, "source_type": d.get("source_type")},
                )
            )

        # 3. Meetings & Audio Transcripts
        cursor_m = db["meetings"].find({"project_id": project_id}).sort("created_at", -1).limit(15)
        meetings = await cursor_m.to_list(length=15)
        for m in meetings:
            ts = m.get("started_at") or m.get("created_at") or now
            events.append(
                ProjectTimelineEvent(
                    id=str(ObjectId()),
                    event_id=f"timeline_meet_{m.get('meeting_id')}",
                    project_id=project_id,
                    event_type="MEETING",
                    source_id=m.get("meeting_id"),
                    title=f"Voice Meeting: {m.get('title', 'Team Sync')}",
                    description=f"Status: {m.get('status', 'ENDED')} · Participants: {len(m.get('participants', []))}",
                    author=m.get("created_by", "Team Member"),
                    timestamp=ts if isinstance(ts, datetime) else now,
                    metadata={"status": m.get("status")},
                )
            )

        # 4. Action Items
        cursor_a = db["action_items"].find({"project_id": project_id}).sort("created_at", -1).limit(15)
        actions = await cursor_a.to_list(length=15)
        for a in actions:
            ts = a.get("created_at") or now
            events.append(
                ProjectTimelineEvent(
                    id=str(ObjectId()),
                    event_id=f"timeline_act_{a.get('action_id')}",
                    project_id=project_id,
                    event_type="ACTION_ITEM",
                    source_id=a.get("action_id"),
                    title=f"Action Milestone: {a.get('title', '')[:80]}",
                    description=f"Assignee: {a.get('assignee_name') or 'Unassigned'} · Status: {a.get('status')}",
                    author="Action Extractor",
                    timestamp=ts if isinstance(ts, datetime) else now,
                    metadata={"status": a.get("status"), "assignee": a.get("assignee_name")},
                )
            )

        # 5. GitHub Code Ingestion & Repository Sync
        project_doc = await db["projects"].find_one({"project_id": project_id})
        if project_doc and project_doc.get("github_repo_name"):
            chunks = project_doc.get("ingestion_status", {}).get("github_chunks_count", 0)
            events.append(
                ProjectTimelineEvent(
                    id=str(ObjectId()),
                    event_id=f"timeline_git_{project_id}",
                    project_id=project_id,
                    event_type="GITHUB",
                    source_id=project_id,
                    title=f"Codebase Ingested: {project_doc.get('github_repo_name')}",
                    description=f"Indexed {chunks} semantic AST code chunks into Qdrant vector database.",
                    author="GitHub Ingestion Service",
                    timestamp=now,
                    metadata={"repo": project_doc.get("github_repo_name"), "chunks": chunks},
                )
            )

        # Sort all events chronologically (newest first)
        events.sort(key=lambda x: x.timestamp, reverse=True)

        # Filter if requested
        if event_type_filter and event_type_filter.upper() != "ALL":
            events = [e for e in events if e.event_type.upper() == event_type_filter.upper()]

        # Cache/upsert timeline events without modifying immutable _id
        for ev in events:
            try:
                ev_data = ev.model_dump(by_alias=True)
                ev_data.pop("_id", None)
                await db[self.COLLECTION_NAME].update_one(
                    {"event_id": ev.event_id, "project_id": project_id},
                    {"$set": ev_data},
                    upsert=True,
                )
            except Exception:
                pass

        query: dict = {"project_id": project_id}
        if event_type_filter and event_type_filter.upper() != "ALL":
            query["event_type"] = event_type_filter.upper()

        cursor_res = db[self.COLLECTION_NAME].find(query).sort("timestamp", -1).limit(limit)
        docs = await cursor_res.to_list(length=limit)
        
        parsed_events: list[ProjectTimelineEvent] = []
        for d in docs:
            try:
                if "_id" in d:
                    d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d.get("_id", str(ObjectId()))
                ts = d.get("timestamp")
                if isinstance(ts, str):
                    d["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                if not d.get("timestamp"):
                    d["timestamp"] = now
                parsed_events.append(ProjectTimelineEvent(**d))
            except Exception:
                pass

        # If DB query returned nothing or failed on deserialization, return direct events
        if not parsed_events and events:
            return events[:limit]

        return parsed_events

