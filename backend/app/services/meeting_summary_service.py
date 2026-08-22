import json
import re
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from openai import AsyncOpenAI
from groq import AsyncGroq

from app.core.config import settings
from app.models.meeting import MeetingSummaryModel, MeetingModel
from app.services.memory_service import ProjectMemoryService
from app.services.decision_service import DecisionService
from app.services.action_item_service import ActionItemService


SUMMARY_PROMPT = """You are Forge AI analyzing a completed software project meeting. Generate a concise, highly structured technical summary.

Transcript:
{transcript}

Provide a JSON object with:
- "overview": 2-3 sentence summary of the meeting's purpose and primary outcomes.
- "key_points": Array of 3-6 bullet points covering major topics discussed.
- "decisions": Array of architectural/technical/product decisions agreed upon during this meeting.
- "action_items": Array of specific tasks committed to with assignees if mentioned.
- "unresolved_questions": Array of open questions or topics postponed for future discussions.

Respond with ONLY valid JSON."""


class MeetingSummaryService:
    """Generates structured post-meeting summaries and indexes meeting intelligence into Project Memory."""

    COLLECTION_NAME = "meeting_summaries"

    def __init__(self):
        self.memory_service = ProjectMemoryService()
        self.decision_service = DecisionService()
        self.action_service = ActionItemService()

    @classmethod
    def _cognitive_synthesize_summary(
        cls, meeting_title: str, transcript_docs: list[dict], action_items: list[dict], decisions: list[dict]
    ) -> dict:
        """Cognitive fallback: Synthesizes a structured meeting summary directly from transcripts, decisions, and action items."""
        speakers = list(dict.fromkeys(d.get("speaker_name", "Team") for d in transcript_docs if d.get("speaker_name") and d.get("speaker_name") != "ai"))
        speakers_str = ", ".join(speakers) if speakers else "Team members"

        # Extract topics discussed
        lines = [d.get("text", "").strip() for d in transcript_docs if len(d.get("text", "").strip()) > 8]
        key_points = []
        for l in lines:
            if any(k in l.lower() for k in ["stack", "database", "architecture", "redis", "postgres", "api", "git", "auth", "deploy", "ci/cd"]):
                if len(l) > 15 and l not in key_points:
                    key_points.append(l[:120])
            if len(key_points) >= 4:
                break

        if not key_points and lines:
            key_points = [lines[0][:120]]
            if len(lines) > 1:
                key_points.append(lines[-1][:120])

        if not key_points:
            key_points = ["Reviewed project architecture and development priorities."]

        overview = f"Meeting '{meeting_title}' held with {speakers_str}. Discussed architectural stack alignment, component boundaries, and upcoming implementation deliverables."

        # Collect decisions
        dec_list = [d.get("decision_text", "") for d in decisions if d.get("decision_text")]
        if not dec_list:
            for l in lines:
                if any(k in l.lower() for k in ["decided", "agree", "will use", "adopt", "standard"]):
                    dec_list.append(l[:120])
                    break

        # Collect action items
        act_list = [f"{a.get('title', '')} (Assignee: {a.get('assignee_name', 'Team')})" for a in action_items if a.get("title")]

        # Collect open questions
        unresolved = []
        for l in lines:
            if l.endswith("?") and not any(k in l.lower() for k in ["what is", "how do"]):
                unresolved.append(l[:120])
                if len(unresolved) >= 2:
                    break

        return {
            "overview": overview,
            "key_points": key_points,
            "decisions": dec_list,
            "action_items": act_list,
            "unresolved_questions": unresolved,
        }

    async def generate_and_index_summary(
        self,
        project_id: str,
        meeting_id: str,
        db: AsyncIOMotorDatabase,
    ) -> Optional[MeetingSummaryModel]:
        """Generate structured meeting summary, extract decisions/actions, and index to Project Memory."""
        # 1. Fetch meeting
        meeting_doc = await db["meetings"].find_one({"$or": [{"meeting_id": meeting_id}, {"_id": meeting_id}]})
        if not meeting_doc:
            try:
                meeting_doc = await db["meetings"].find_one({"_id": ObjectId(meeting_id)})
            except Exception:
                pass
            if not meeting_doc:
                return None
        meeting = MeetingModel(**meeting_doc)
        project_id = meeting.project_id

        # Fetch existing summary record if any to preserve _id
        existing_doc = await db[self.COLLECTION_NAME].find_one({"meeting_id": meeting_id})
        doc_id = str(existing_doc["_id"]) if existing_doc and "_id" in existing_doc else str(ObjectId())
        sum_id = existing_doc.get("summary_id") if existing_doc and "summary_id" in existing_doc else str(ObjectId())

        cursor = db["meeting_transcripts"].find({"meeting_id": meeting_id}).sort("sequence", 1)
        transcript_docs = await cursor.to_list(length=500)

        if not transcript_docs:
            summary = MeetingSummaryModel(
                id=doc_id,
                summary_id=sum_id,
                meeting_id=meeting_id,
                project_id=project_id,
                overview=f"Meeting '{meeting.title}' concluded with no spoken dialogue recorded.",
                key_points=["Meeting session initialized and completed."],
                decisions=[],
                action_items=[],
                unresolved_questions=[],
                generated_at=datetime.now(timezone.utc),
            )
            update_data = summary.model_dump(by_alias=True)
            update_data.pop("_id", None)
            await db[self.COLLECTION_NAME].update_one(
                {"meeting_id": meeting_id},
                {"$set": update_data, "$setOnInsert": {"_id": doc_id}},
                upsert=True,
            )
            return summary

        full_transcript_text = "\n".join(
            f"[{d.get('speaker_name', 'Speaker')}]: {d.get('text', '')}"
            for d in transcript_docs
        )

        data = None

        # 2. Try Groq LLM
        if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("mock"):
            try:
                groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                comp = await groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are Forge AI generating a structured project meeting summary. Always respond with valid JSON.",
                        },
                        {"role": "user", "content": SUMMARY_PROMPT.format(transcript=full_transcript_text[:10000])},
                    ],
                    temperature=0.2,
                    max_tokens=600,
                )
                raw = comp.choices[0].message.content.strip().removeprefix("```json").removesuffix("```").strip()
                data = json.loads(raw)
            except Exception:
                pass

        # 3. Try OpenAI LLM
        if not data and settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("mock"):
            try:
                openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                comp = await openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are Forge AI generating a structured project meeting summary. Always respond with valid JSON.",
                        },
                        {"role": "user", "content": SUMMARY_PROMPT.format(transcript=full_transcript_text[:10000])},
                    ],
                    temperature=0.2,
                    max_tokens=600,
                )
                raw = comp.choices[0].message.content.strip().removeprefix("```json").removesuffix("```").strip()
                data = json.loads(raw)
            except Exception:
                pass

        # 4. Cognitive Fallback
        if not data:
            cursor_act = db["action_items"].find({"meeting_id": meeting_id})
            act_docs = await cursor_act.to_list(20)
            cursor_dec = db["decisions"].find({"project_id": project_id})
            dec_docs = await cursor_dec.to_list(10)
            data = self._cognitive_synthesize_summary(meeting.title, transcript_docs, act_docs, dec_docs)

        # 5. Persist MeetingSummaryModel without modifying _id
        summary = MeetingSummaryModel(
            id=doc_id,
            summary_id=sum_id,
            meeting_id=meeting_id,
            project_id=project_id,
            overview=data.get("overview", f"Meeting '{meeting.title}' concluded.").strip(),
            key_points=data.get("key_points", []),
            decisions=data.get("decisions", []),
            action_items=data.get("action_items", []),
            unresolved_questions=data.get("unresolved_questions", []),
            generated_at=datetime.now(timezone.utc),
        )

        update_data = summary.model_dump(by_alias=True)
        update_data.pop("_id", None)
        await db[self.COLLECTION_NAME].update_one(
            {"meeting_id": meeting_id},
            {"$set": update_data, "$setOnInsert": {"_id": doc_id}},
            upsert=True,
        )

        # 6. Ingest into Project Memory (Non-blocking)
        try:
            memory_content = f"Meeting Summary ({meeting.title}):\n{summary.overview}\n\nKey Points:\n" + "\n".join(f"- {p}" for p in summary.key_points)
            if summary.decisions:
                memory_content += "\n\nDecisions:\n" + "\n".join(f"- {d}" for d in summary.decisions)
            if summary.action_items:
                memory_content += "\n\nAction Items:\n" + "\n".join(f"- {a}" for a in summary.action_items)

            project_doc = await db["projects"].find_one({"project_id": project_id})
            col_name = project_doc.get("qdrant_collection_name") if project_doc else f"forge_{project_id}"

            await self.memory_service.index_memory_item(
                project_id=project_id,
                source_type="meeting",
                source_id=f"meeting_{meeting_id}",
                content=memory_content,
                metadata={
                    "meeting_id": meeting_id,
                    "title": meeting.title,
                    "date": summary.generated_at.isoformat(),
                },
                collection_name=col_name,
            )
        except Exception as mem_err:
            print(f"[MeetingSummaryService] Memory indexing note: {mem_err}")

        return summary

    async def get_summary(self, meeting_id: str, db: AsyncIOMotorDatabase) -> Optional[MeetingSummaryModel]:
        """Fetch saved meeting summary."""
        doc = await db[self.COLLECTION_NAME].find_one({"$or": [{"meeting_id": meeting_id}, {"_id": meeting_id}]})
        if not doc:
            try:
                doc = await db[self.COLLECTION_NAME].find_one({"_id": ObjectId(meeting_id)})
            except Exception:
                pass
        return MeetingSummaryModel(**doc) if doc else None
