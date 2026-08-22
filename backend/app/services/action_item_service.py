import json
import re
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from openai import AsyncOpenAI
from groq import AsyncGroq

from app.core.config import settings
from app.models.action_item import (
    ActionItemModel,
    ActionItemStatus,
    CreateActionItemRequest,
    UpdateActionItemRequest,
)


ACTION_EXTRACTION_PROMPT = """Analyze the following transcript excerpt from a software engineering project meeting. Determine if any EXPLICIT ACTION ITEMS, TASKS, OR ASSIGNMENTS were committed to.

CRITERIA FOR A VALID ACTION ITEM:
- Must represent an actionable task someone agreed/was assigned to do (e.g. "Rahul will implement Redis caching by Friday", "I'll update the API docs tomorrow", "Let's configure Docker compose").
- Vague ideas or hypothetical brainstorming without clear assignment should have confidence_score < 0.5 or be omitted.

Provide a JSON object with:
- "has_actions": boolean
- "action_items": Array of objects, each containing:
  - "title": Concise task title (e.g. "Implement Redis caching layer")
  - "description": Additional details or context
  - "assignee_name": Name of person assigned (or null if unassigned)
  - "due_text": Natural language deadline mentioned (e.g. "Friday", "tomorrow", or null)
  - "confidence_score": Float between 0.0 and 1.0

Transcript:
{context}

Respond with ONLY valid JSON."""


class ActionItemService:
    """Service for extracting, managing, and tracking Project Action Items."""

    COLLECTION_NAME = "action_items"

    @classmethod
    def _semantic_extract_action_items(
        cls, text: str, speaker_name: Optional[str] = None
    ) -> list[dict]:
        """Cognitive fallback: Extracts actionable tasks and commitments using semantic pattern matching."""
        items: list[dict] = []
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", text) if len(s.strip()) > 10]

        # Action-oriented regex patterns
        patterns = [
            # "I will / I'll / We will / Let's [verb] ..."
            (r"\b(?:i\s+will|i'll|we\s+will|we'll|let's|gonna)\s+([a-z]+(?:\s+[a-z0-9_\-]+){2,8})", 0.85),
            # "Name, please / can you [verb] ..."
            (r"\b([A-Z][a-z]+)[,\s]+(?:please|can you|could you|should)\s+([a-z]+(?:\s+[a-z0-9_\-]+){2,8})", 0.9),
            # "Need to / have to / must [verb] ..."
            (r"\b(?:need to|have to|must|should|ought to)\s+([a-z]+(?:\s+[a-z0-9_\-]+){2,8})", 0.75),
            # "Action item / Task / TODO: ..."
            (r"\b(?:action item|task|todo)[:\s]+([a-z0-9_\-]+(?:\s+[a-z0-9_\-]+){2,8})", 0.95),
        ]

        for sentence in sentences:
            for pat, conf in patterns:
                m = re.search(pat, sentence, re.IGNORECASE)
                if m:
                    groups = m.groups()
                    if len(groups) == 2:
                        assignee, raw_task = groups
                    else:
                        assignee = speaker_name
                        raw_task = groups[0]

                    clean_title = raw_task.strip().capitalize()
                    # Filter out non-actionable chatter
                    if len(clean_title) >= 12 and not any(w in clean_title.lower() for w in ["think that", "guess we", "hope so", "what is"]):
                        items.append({
                            "title": clean_title,
                            "description": f"Extracted from dialogue: '{sentence}'",
                            "assignee_name": assignee if assignee and assignee != "I" else (speaker_name or "Team"),
                            "confidence_score": conf,
                        })
                        break

        return items

    async def extract_action_items(
        self,
        project_id: str,
        meeting_id: str,
        text: str,
        transcript_segment_id: Optional[str],
        db: AsyncIOMotorDatabase,
        speaker_name: Optional[str] = None,
    ) -> list[ActionItemModel]:
        """Extract structured action items from a transcript segment using LLM with Cognitive Semantic Fallback."""
        if not text or len(text.strip()) < 12:
            return []

        raw_items: list[dict] = []
        llm_success = False

        # 1. Try Groq LLM if available
        if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("mock"):
            try:
                groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                completion = await groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an AI meeting assistant extracting action items. Always respond with valid JSON.",
                        },
                        {"role": "user", "content": ACTION_EXTRACTION_PROMPT.format(context=text)},
                    ],
                    temperature=0.1,
                    max_tokens=300,
                )
                raw = completion.choices[0].message.content.strip().removeprefix("```json").removesuffix("```").strip()
                data = json.loads(raw)
                if data.get("has_actions") and data.get("action_items"):
                    raw_items = data["action_items"]
                    llm_success = True
            except Exception as gr_err:
                pass

        # 2. Try OpenAI LLM if available
        if not llm_success and settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("mock"):
            try:
                openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                completion = await openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an AI meeting assistant extracting action items. Always respond with valid JSON.",
                        },
                        {"role": "user", "content": ACTION_EXTRACTION_PROMPT.format(context=text)},
                    ],
                    temperature=0.1,
                    max_tokens=300,
                )
                raw = completion.choices[0].message.content.strip().removeprefix("```json").removesuffix("```").strip()
                data = json.loads(raw)
                if data.get("has_actions") and data.get("action_items"):
                    raw_items = data["action_items"]
                    llm_success = True
            except Exception as oa_err:
                pass

        # 3. Cognitive Semantic Fallback
        if not raw_items:
            raw_items = self._semantic_extract_action_items(text, speaker_name=speaker_name)

        if not raw_items:
            return []

        # 4. Deduplicate and persist action items
        extracted: list[ActionItemModel] = []
        for item in raw_items:
            title = item.get("title", "").strip()
            if not title:
                continue

            confidence = float(item.get("confidence_score", 0.8))
            if confidence < 0.4:
                continue

            # Check if similar action item exists
            existing = await db[self.COLLECTION_NAME].find_one({
                "project_id": project_id,
                "meeting_id": meeting_id,
                "title": {"$regex": re.escape(title[:25]), "$options": "i"},
            })
            if existing:
                continue

            action_obj = ActionItemModel(
                id=str(ObjectId()),
                action_id=str(ObjectId()),
                project_id=project_id,
                meeting_id=meeting_id,
                title=title,
                description=item.get("description", "").strip(),
                assignee_name=item.get("assignee_name") or speaker_name or "Team",
                status=ActionItemStatus.TODO.value,
                confidence_score=confidence,
                source_transcript_segment_id=transcript_segment_id,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            await db[self.COLLECTION_NAME].insert_one(action_obj.model_dump(by_alias=True))
            extracted.append(action_obj)

        return extracted

    async def create_action_item(
        self,
        project_id: str,
        data: CreateActionItemRequest,
        db: AsyncIOMotorDatabase,
    ) -> ActionItemModel:
        """Manually create an action item."""
        action = ActionItemModel(
            id=str(ObjectId()),
            action_id=str(ObjectId()),
            project_id=project_id,
            meeting_id=data.meeting_id,
            title=data.title,
            description=data.description or "",
            assignee_name=data.assignee_name,
            due_date=data.due_date,
            status=data.status.value,
            confidence_score=1.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        await db[self.COLLECTION_NAME].insert_one(action.model_dump(by_alias=True))
        return action

    async def get_project_action_items(
        self,
        project_id: str,
        meeting_id: Optional[str],
        status_filter: Optional[str],
        db: AsyncIOMotorDatabase,
    ) -> list[ActionItemModel]:
        """Fetch all action items for a project with optional filters."""
        query: dict = {"project_id": project_id}
        if meeting_id:
            query["meeting_id"] = meeting_id
        if status_filter:
            query["status"] = status_filter

        cursor = db[self.COLLECTION_NAME].find(query).sort("created_at", -1)
        docs = await cursor.to_list(length=200)
        return [ActionItemModel(**d) for d in docs]

    async def update_action_item(
        self,
        action_id: str,
        data: UpdateActionItemRequest,
        db: AsyncIOMotorDatabase,
    ) -> Optional[ActionItemModel]:
        """Update status, assignee, or details of an existing action item."""
        update_fields: dict = {"updated_at": datetime.now(timezone.utc)}
        if data.status is not None:
            update_fields["status"] = data.status.value
        if data.title is not None:
            update_fields["title"] = data.title
        if data.description is not None:
            update_fields["description"] = data.description
        if data.assignee_name is not None:
            update_fields["assignee_name"] = data.assignee_name
        if data.due_date is not None:
            update_fields["due_date"] = data.due_date

        result = await db[self.COLLECTION_NAME].find_one_and_update(
            {"action_id": action_id},
            {"$set": update_fields},
            return_document=True,
        )
        return ActionItemModel(**result) if result else None
