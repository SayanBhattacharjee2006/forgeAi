import re
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from openai import AsyncOpenAI
from groq import AsyncGroq

from app.core.config import settings
from app.models.project import ProjectModel, ProjectAIConfig
from app.models.chat import SourceCitation
from app.models.meeting import TranscriptSegmentModel
from app.services.constitution_service import ConstitutionService
from app.services.meeting_connection_manager import meeting_connection_manager


class MeetingAIService:
    """Handles real-time Forge AI participation in Project Meetings with voice invocation and Advanced RAG."""

    TRANSCRIPTS_COLLECTION = "meeting_transcripts"

    @classmethod
    def detect_meeting_ai_invocation(
        cls, text: str, ai_config: Optional[ProjectAIConfig] = None
    ) -> tuple[bool, str]:
        """Detect if spoken transcript is addressing Forge AI or asking a project question."""
        if not text:
            return False, text

        cleaned_text = text.strip()
        invoc_phrase = (ai_config.invocation_phrase if ai_config and ai_config.invocation_phrase else "Forge").strip()
        ai_name = (ai_config.name if ai_config and ai_config.name else "Forge").strip()

        triggers = {
            invoc_phrase.lower(),
            ai_name.lower(),
            "forge",
            "forg",
            "4ge",
            "4g",
            "ford",
            "force",
            "assistant",
            "ai",
            "copilot",
            "bot",
        }

        # 1. Mention of Forge or AI anywhere in the sentence
        for trigger in triggers:
            trigger_pattern = rf"\b{re.escape(trigger)}\b"
            if re.search(trigger_pattern, cleaned_text, re.IGNORECASE):
                cleaned = re.sub(trigger_pattern, "", cleaned_text, flags=re.IGNORECASE).strip()
                cleaned = re.sub(r"^[,\s:?!@]+|[,\s:?!@]+$", "", cleaned).strip()
                return True, cleaned or cleaned_text

        # 2. Addressed with greeting or prompt: e.g. "Hey, what...", "Listen, can you..."
        greeting_pattern = r"^(?:hey|hi|hello|ok|okay|listen)\s*[,:\-\s]\s*(.+)$"
        m_greet = re.match(greeting_pattern, cleaned_text, re.IGNORECASE)
        if m_greet:
            return True, m_greet.group(1).strip()

        # 3. Any direct question asked in the meeting (ends with ? or starts with question word)
        q_pattern = r"^(what|how|why|who|where|when|which|can|could|explain|tell|is|are|do|does|should|will|would)\b|(\?$)"
        if re.search(q_pattern, cleaned_text, re.IGNORECASE):
            return True, cleaned_text

        return False, cleaned_text


    async def handle_live_voice_query(
        self,
        project: ProjectModel,
        meeting_id: str,
        speaker_name: str,
        query: str,
        db: AsyncIOMotorDatabase,
    ) -> dict:
        """Process live voice query: broadcast THINKING → synthesize answer → persist transcript → broadcast SPEAKING."""
        ai = project.ai_config or ProjectAIConfig(
            name="Forge", role="Project Assistant", invocation_phrase="Forge"
        )

        # 1. Update & broadcast THINKING state
        meeting_connection_manager.set_ai_state(meeting_id, "THINKING")
        await meeting_connection_manager.broadcast(
            meeting_id,
            {
                "type": "ai_state",
                "state": "THINKING",
                "ai_name": ai.name,
                "query": query,
            },
        )

        # 2. Retrieve Constitution and Decisions
        constitution = await ConstitutionService.get_or_create_constitution(db, project.project_id, "system")
        sec = constitution.sections
        tech = sec.technology
        arch = sec.architecture
        coding = sec.coding_standards
        git = sec.git_workflow
        api_conv = sec.api_conventions

        cursor = db["decisions"].find({"project_id": project.project_id}).limit(5)
        decisions = await cursor.to_list(5)

        citations = [
            SourceCitation(
                source_type="constitution",
                source_id=f"Project Constitution v{constitution.version}",
                source_url="",
                relevance_score=1.0,
                content_preview=f"Stack: {', '.join(tech.frameworks or ['React', 'Next.js'])}, DB: {', '.join(tech.databases or ['PostgreSQL'])}",
            )
        ]

        response_text = ""
        q_lower = query.lower()

        # 3. Try Remote LLM (Groq or OpenAI)
        if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("mock"):
            try:
                client_gr = AsyncGroq(api_key=settings.GROQ_API_KEY)
                comp = await client_gr.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {
                            "role": "system",
                            "content": f"You are {ai.name}, the real-time AI collaborator in a voice meeting for '{project.name}'. Give a concise, conversational 2-3 sentence spoken answer based on the stack ({', '.join(tech.frameworks or [])}, {', '.join(tech.databases or [])}) and architecture ({arch.style or 'Standard'}).",
                        },
                        {"role": "user", "content": f"{speaker_name} asks: {query}"},
                    ],
                    max_tokens=180,
                )
                if comp.choices and comp.choices[0].message.content:
                    response_text = comp.choices[0].message.content.strip()
            except Exception:
                pass

        # 4. Cognitive Voice Answer Synthesis
        if not response_text:
            if any(k in q_lower for k in ["stack", "tech", "technology", "language", "framework", "database", "tools"]):
                langs = ", ".join(tech.languages) if tech.languages else "TypeScript and Python"
                frameworks = ", ".join(tech.frameworks) if tech.frameworks else "Next.js and FastAPI"
                dbs = ", ".join(tech.databases) if tech.databases else "MongoDB and PostgreSQL"
                response_text = f"According to our Project Constitution, {project.name} is built with {frameworks} using {langs}, with persistence in {dbs}."
            elif any(k in q_lower for k in ["architecture", "style", "boundary", "service", "topology", "layer"]):
                style = arch.style or "Layered Microservices Architecture"
                boundaries = ", ".join(arch.service_boundaries[:3]) if arch.service_boundaries else "API Gateway, Core Domain Services, and Persistence Layer"
                response_text = f"Our system follows a {style}. Key services include {boundaries}."
            elif any(k in q_lower for k in ["decision", "adr", "agreements", "why"]):
                if decisions:
                    latest = decisions[0].get("decision_text", "")
                    response_text = f"Our most recent architectural agreement is: {latest}."
                else:
                    response_text = f"We have not logged any conflicting decisions yet. You can agree on conventions right here in our voice meeting."
            elif any(k in q_lower for k in ["git", "branch", "commit", "pr"]):
                merge = git.merge_strategy or "Squash and merge"
                response_text = f"Our Git workflow follows conventional commits with a {merge} strategy and required CI checks."
            elif any(k in q_lower for k in ["api", "endpoint", "rest", "graphql"]):
                style = api_conv.style or "REST"
                response_text = f"Our API design follows {style} conventions under the /api/v1 version prefix."
            else:
                response_text = f"Hello {speaker_name}! I am {ai.name}. I am tracking our meeting dialogue, architecture, and Project Constitution agreements for {project.name}."

        # 5. Persist Forge's response as a transcript segment in meeting_transcripts
        count = await db[self.TRANSCRIPTS_COLLECTION].count_documents({"meeting_id": meeting_id})
        ai_segment = TranscriptSegmentModel(
            id=str(ObjectId()),
            segment_id=str(ObjectId()),
            meeting_id=meeting_id,
            project_id=project.project_id,
            speaker_id="ai",
            speaker_name=ai.name,
            text=response_text,
            is_final=True,
            sequence=count + 1,
            timestamp=datetime.now(timezone.utc),
        )
        await db[self.TRANSCRIPTS_COLLECTION].insert_one(ai_segment.model_dump(by_alias=True))

        # 6. Broadcast transcript segment so it appears in Live Dialogue Stream
        await meeting_connection_manager.broadcast(
            meeting_id,
            {
                "type": "transcript",
                "data": ai_segment.model_dump(by_alias=True),
            },
        )

        # 7. Broadcast SPEAKING state and AI response
        meeting_connection_manager.set_ai_state(meeting_id, "SPEAKING")
        await meeting_connection_manager.broadcast(
            meeting_id,
            {
                "type": "ai_response",
                "state": "SPEAKING",
                "ai_name": ai.name,
                "content": response_text,
                "sources": [c.model_dump() for c in citations],
            },
        )

        # 8. Reset to IDLE
        meeting_connection_manager.set_ai_state(meeting_id, "IDLE")
        await meeting_connection_manager.broadcast(
            meeting_id,
            {
                "type": "ai_state",
                "state": "IDLE",
                "ai_name": ai.name,
            },
        )

        return {
            "ai_name": ai.name,
            "content": response_text,
            "sources": [c.model_dump() for c in citations],
        }
