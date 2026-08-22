"""RAG (Retrieval-Augmented Generation) service for Forge.

Uses ProjectContextService to ground answers in Project Constitution, active Decisions,
and Project Memory vector chunks with strict project isolation and source citations.
"""

from datetime import datetime, timezone
import time
from bson import ObjectId

from openai import AsyncOpenAI
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.models.project import ProjectModel
from app.models.chat import ChatMessageModel, SourceCitation
from app.services.project_context_service import ProjectContextService
from app.telemetry.metrics import metrics
from app.telemetry.tracing import trace_span


SYSTEM_PROMPT = """You are Forge AI — an intelligent, context-aware project knowledge and team collaboration assistant.

You answer questions about the software project grounded directly in the project context below, which includes the Project Constitution, active team Decisions, source code files, Git commits/PRs, and team communications.

Guidelines:
- Ground your answers directly in the provided context whenever relevant. Mention specific file paths, commit SHAs, PR numbers, or member names when citing sources.
- Prioritize rules in the Project Constitution and active Decisions.
- Synthesize information across multiple sources (e.g. code + chat + decisions + commits) when answering.
- If the context doesn't contain enough information to answer, clearly explain what IS known about the project and provide a constructive response.
- Use markdown formatting with code blocks, bullet points, and bold text. Keep answers practical, structured, and easy to read.

Project Context:
{context}"""


class RAGService:
    """Retrieval-Augmented Generation pipeline consuming unified Project Context."""

    def __init__(self):
        self.openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.context_service = ProjectContextService()
        self.generation_model = "gpt-4o-mini"

    async def query(
        self,
        project_id: str,
        collection_name: str,
        user_message: str,
        user_id: str,
        db: AsyncIOMotorDatabase,
        interface_type: str = "text",
    ) -> dict:
        """Full RAG pipeline: ProjectContext assembly → generate answer → save history."""
        request_start = time.perf_counter()
        trace: list[str] = []

        # 1. Fetch project model
        project_doc = await db["projects"].find_one({"project_id": project_id})
        if project_doc:
            project = ProjectModel(**project_doc)
        else:
            project = ProjectModel(
                project_id=project_id,
                name="Project",
                slug=project_id,
                owner_id=user_id,
                qdrant_collection_name=collection_name,
            )

        # 2. Build unified project context
        trace.append("Retrieving Project Constitution, active Decisions, and Memory chunks...")
        with trace_span("Forge request", {"project_id": project_id, "interface": interface_type}):
            with trace_span("context retrieval", {"project_id": project_id}):
                context_result = await self.context_service.build_project_context(
                    project=project,
                    query_text=user_message,
                    db=db,
                )
        sources: list[SourceCitation] = context_result.citations
        trace.extend(context_result.trace)
        trace.append(f"Assembled context with {len(sources)} verified source citations")

        # 3. Save user message to chat history
        user_msg = ChatMessageModel(
            message_id=str(ObjectId()),
            project_id=project_id,
            user_id=user_id,
            role="user",
            content=user_message,
            sources=[],
            interface_type=interface_type,
            created_at=datetime.now(timezone.utc),
        )
        await db["chat_history"].insert_one(user_msg.model_dump(by_alias=True))

        # 4. Fetch recent chat history for conversational context (last 6 messages)
        trace.append("Loading recent conversation history...")
        history_cursor = db["chat_history"].find(
            {"project_id": project_id, "user_id": user_id},
            sort=[("created_at", -1)],
            limit=6,
        )
        history_docs = await history_cursor.to_list(length=6)
        history_docs.reverse()

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context_result.formatted_context)},
        ]
        for doc in history_docs:
            messages.append({"role": doc["role"], "content": doc["content"]})

        # 5. Call GPT-4o-mini
        trace.append("Generating grounded answer with gpt-4o-mini...")
        llm_start = time.perf_counter()
        usage = None
        with trace_span("LLM", {"model": self.generation_model, "project_id": project_id}):
            try:
                completion = await self.openai.chat.completions.create(
                    model=self.generation_model,
                    messages=messages,
                    temperature=0.3,
                    max_tokens=1024,
                )
                usage = completion.usage
                metrics.record_llm_call(
                    model=self.generation_model,
                    operation="rag_query",
                    status="success",
                    duration_seconds=time.perf_counter() - llm_start,
                    prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                    completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                )
            except Exception:
                metrics.record_llm_call(
                    model=self.generation_model,
                    operation="rag_query",
                    status="error",
                    duration_seconds=time.perf_counter() - llm_start,
                )
                raise
        assistant_content = completion.choices[0].message.content or "I processed your request."
        trace.append("Answer generated and cited")

        # 6. Save assistant response to chat history
        assistant_msg = ChatMessageModel(
            message_id=str(ObjectId()),
            project_id=project_id,
            user_id=user_id,
            role="assistant",
            content=assistant_content,
            sources=sources,
            interface_type=interface_type,
            created_at=datetime.now(timezone.utc),
        )
        await db["chat_history"].insert_one(assistant_msg.model_dump(by_alias=True))

        return {
            "message_id": assistant_msg.message_id,
            "content": assistant_content,
            "sources": [s.model_dump() for s in sources],
            "created_at": assistant_msg.created_at,
            "trace": trace,
            "retrieved_documents": context_result.retrieved_documents,
            "retrieval_stats": context_result.retrieval_stats,
            "timings_ms": {
                **context_result.timings_ms,
                "llm": round((time.perf_counter() - llm_start) * 1000.0, 3),
                "total": round((time.perf_counter() - request_start) * 1000.0, 3),
            },
            "usage": {
                "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
                "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
                "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
                "cost_usd": None,
                "cost_status": "unavailable",
            },
        }
