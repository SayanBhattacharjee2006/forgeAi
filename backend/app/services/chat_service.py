import asyncio
import re
import time
from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from openai import AsyncOpenAI
from groq import AsyncGroq

from app.core.config import settings
from app.models.project import ProjectModel, ProjectAIConfig
from app.models.chat import ChatMessageModel, SourceCitation
from app.services.project_context_service import ProjectContextService
from app.services.constitution_service import ConstitutionService
from app.services.architecture_service import build_project_architecture_graph
from app.telemetry.metrics import metrics


class ChatService:
    """Service handling Unified Project Chat messages, AI invocation detection, and memory grounding."""

    COLLECTION_NAME = "chat_history"

    @classmethod
    def detect_ai_invocation(
        cls, content: str, ai_config: Optional[ProjectAIConfig] = None
    ) -> tuple[bool, str]:
        """Detect if a user message is invoking the project AI assistant or asking a question."""
        if not content:
            return False, content

        invoc_phrase = (ai_config.invocation_phrase if ai_config and ai_config.invocation_phrase else "Forge").strip()
        ai_name = (ai_config.name if ai_config and ai_config.name else "Forge").strip()

        triggers = {invoc_phrase.lower(), ai_name.lower(), "forge", "ai", "bot", "assistant"}

        # 1. Check for @mention (e.g. @Atlas, @Forge, @ai, @bot)
        for trigger in triggers:
            pattern = rf"@\b{re.escape(trigger)}\b"
            if re.search(pattern, content, re.IGNORECASE):
                cleaned = re.sub(pattern, "", content, flags=re.IGNORECASE).strip()
                return True, cleaned or content

        # 2. Check for start of message invocation (e.g. "Forge, explain ...", "Hey Forge: ...")
        for trigger in triggers:
            pattern = rf"^(hey\s+|hi\s+|hello\s+)?\b{re.escape(trigger)}\b[\s,:\-]+"
            if re.search(pattern, content, re.IGNORECASE):
                cleaned = re.sub(pattern, "", content, flags=re.IGNORECASE).strip()
                return True, cleaned or content

        # 3. Direct question or inquiry addressed in 1-on-1 project chat
        # In Unified Project Chat, user messages asking questions or providing prompts invoke Forge
        return True, content

    @classmethod
    async def save_user_message(
        cls,
        db: AsyncIOMotorDatabase,
        project_id: str,
        user_id: str,
        user_name: str,
        user_avatar: Optional[str],
        content: str,
        is_ai_invocation: bool = False,
    ) -> ChatMessageModel:
        """Persist a human user's chat message to MongoDB."""
        msg = ChatMessageModel(
            id=str(ObjectId()),
            message_id=str(ObjectId()),
            project_id=project_id,
            user_id=user_id,
            user_name=user_name,
            user_avatar=user_avatar,
            role="user",
            content=content,
            is_ai_generated=False,
            is_ai_invocation=is_ai_invocation,
            created_at=datetime.now(timezone.utc),
        )
        await db[cls.COLLECTION_NAME].insert_one(msg.model_dump(by_alias=True))
        return msg

    @classmethod
    def _synthesize_cognitive_answer(
        cls,
        query: str,
        project_name: str,
        ai_name: str,
        ai_role: str,
        constitution: Any,
        decisions: list[dict],
        arch_graph: dict[str, Any],
    ) -> str:
        """Generates a rich, authoritative, and structured markdown response grounded in the Project Constitution and Architecture."""
        q_lower = query.lower()
        sec = constitution.sections
        tech = sec.technology
        arch = sec.architecture
        coding = sec.coding_standards
        git = sec.git_workflow
        api_conv = sec.api_conventions
        ui_conv = sec.design_ui_conventions
        general = sec.general_rules

        # Topic 1: Technology Stack / Frameworks / Languages / Databases
        if any(k in q_lower for k in ["stack", "tech", "technology", "language", "framework", "database", "db", "infra", "tools"]):
            langs = ", ".join(tech.languages) if tech.languages else "TypeScript, Python"
            frameworks = ", ".join(tech.frameworks) if tech.frameworks else "Next.js, FastAPI, TailwindCSS"
            databases = ", ".join(tech.databases) if tech.databases else "MongoDB, PostgreSQL, Redis"
            infra = ", ".join(tech.infrastructure) if tech.infrastructure else "Docker, AWS Cloud, GitHub Actions"
            external = ", ".join(tech.external_services) if tech.external_services else "None configured"

            return f"""### 🛠️ {project_name} Technology Stack

According to our **Project Constitution**, here are the authoritative stack agreements:

* **Core Languages:** `{langs}`
* **Frameworks & Libraries:** `{frameworks}`
* **Databases & Persistent Stores:** `{databases}`
* **Deployment & Cloud Infrastructure:** `{infra}`
* **External Third-Party Services:** `{external}`

> **Constitution Rule:** All pull requests and new features must strictly adhere to these validated technologies."""

        # Topic 2: Architecture / System Topology / Microservices / Boundaries
        if any(k in q_lower for k in ["architecture", "arch", "system", "tier", "boundary", "service", "layer", "diagram", "topology"]):
            style = arch.style or arch_graph.get("domain", "Layered Microservices Architecture")
            nodes = arch_graph.get("nodes", [])
            tier1 = [n["label"] for n in nodes if n.get("tier") == 1]
            tier2 = [n["label"] for n in nodes if n.get("tier") == 2]
            tier3 = [n["label"] for n in nodes if n.get("tier") == 3]
            tier4 = [n["label"] for n in nodes if n.get("tier") == 4]

            boundaries_text = "\n".join([f"  * **{b}**" for b in arch.service_boundaries]) if arch.service_boundaries else "\n".join([f"  * **{s}**" for s in tier3])

            return f"""### 🏛️ System Architecture: {project_name}

* **Architectural Style:** `{style}`

#### 4-Tier Topology Overview:
1. **Tier 1 (UI & Clients):** {', '.join(tier1) or 'Responsive Web Application'}
2. **Tier 2 (API Gateway):** {', '.join(tier2) or f'{api_conv.style or "REST"} API Gateway'}
3. **Tier 3 (Domain & Business Services):**
{boundaries_text}
4. **Tier 4 (Data & Infrastructure):** {', '.join(tier4) or 'Operational Databases & Cloud Hosting'}

> **Layering Agreement:** Direct database access is restricted to Tier 3 domain services. Client applications communicate exclusively through the API Gateway."""

        # Topic 3: Decisions / ADRs
        if any(k in q_lower for k in ["decision", "adr", "agreements", "why", "resolved"]):
            if decisions:
                d_lines = []
                for d in decisions[:5]:
                    text = d.get("decision_text", d.get("title", ""))
                    status_tag = d.get("status", "ACTIVE")
                    author = ", ".join(d.get("participants", [])) or "Team"
                    d_lines.append(f"* **[{status_tag}]** {text} *(By: {author})*")
                return f"""### 📋 Active Architectural Decisions for {project_name}

Here are the most recent active team agreements from the Decision Log:

{chr(10).join(d_lines)}

*You can inspect all semantic relations and conflict trees in the **Knowledge Graph** tab.*"""
            else:
                return f"""### 📋 Decision Intelligence Log

No conflicting or custom architectural decisions have been logged yet for **{project_name}**.
You can log decisions by chatting with @Forge or conducting a live Voice Sync meeting."""

        # Topic 4: Git Workflow / Branching / PR Rules
        if any(k in q_lower for k in ["git", "branch", "commit", "pr", "pull request", "merge"]):
            branches = ", ".join(git.branch_naming) if git.branch_naming else "`feature/*`, `fix/*`, `chore/*`"
            commits = ", ".join(git.commit_conventions) if git.commit_conventions else "Conventional Commits (`feat:`, `fix:`, `refactor:`)"
            prs = ", ".join(git.pr_conventions) if git.pr_conventions else "Require 1 approval & green CI checks"
            merge = git.merge_strategy or "Squash and merge"

            return f"""### 🌿 Git Workflow & Protocols

* **Branch Naming:** {branches}
* **Commit Standard:** {commits}
* **PR Review Protocol:** {prs}
* **Merge Strategy:** `{merge}`"""

        # Topic 5: Coding Standards / Formatting
        if any(k in q_lower for k in ["coding", "standard", "format", "naming", "typing", "lint"]):
            naming = ", ".join(coding.naming_conventions) if coding.naming_conventions else "PascalCase for Components/Classes, camelCase for functions"
            typing = ", ".join(coding.typing) if coding.typing else "Strict TypeScript & Type Hints on all public endpoints"
            error = ", ".join(coding.error_handling) if coding.error_handling else "Structured JSON error envelopes with explicit status codes"

            return f"""### 📐 Team Coding Standards

* **Naming Conventions:** {naming}
* **Type Safety:** {typing}
* **Error Handling:** {error}"""

        # Topic 6: API Conventions
        if any(k in q_lower for k in ["api", "endpoint", "rest", "graphql", "grpc", "version"]):
            style = api_conv.style or "REST"
            naming = ", ".join(api_conv.endpoint_naming) if api_conv.endpoint_naming else "kebab-case plural resources (e.g. `/api/v1/projects`)"
            version = ", ".join(api_conv.versioning_rules) if api_conv.versioning_rules else "URL prefix (`/api/v1`)"

            return f"""### 🔌 API Design & Conventions

* **API Protocol:** `{style}`
* **Endpoint Naming:** {naming}
* **Versioning:** {version}"""

        # General Overview / Greeting
        return f"""### 👋 Hello! I am {ai_name}, your {ai_role} for **{project_name}**.

I am connected to your authoritative **Project Constitution**, **Decision Intelligence Log**, and **System Architecture Graph**.

Here is a summary of **{project_name}**:
* **Tech Stack:** {', '.join(tech.frameworks[:3]) if tech.frameworks else 'Next.js, FastAPI, TailwindCSS'} on {', '.join(tech.languages) if tech.languages else 'TypeScript/Python'}
* **Architecture:** {arch.style or 'Layered Microservices'} ({len(arch.service_boundaries)} domain boundaries defined)
* **Databases:** {', '.join(tech.databases) if tech.databases else 'MongoDB, PostgreSQL'}
* **API Style:** `{api_conv.style or 'REST'}`

How can I assist you with your project today?"""

    @classmethod
    async def generate_and_save_ai_response(
        cls,
        db: AsyncIOMotorDatabase,
        project: ProjectModel,
        user_id: str,
        user_message: str,
        trace: Optional[list[str]] = None,
    ) -> ChatMessageModel:
        """Generate a project-grounded AI answer combining Constitution, Decisions, and Memory with robust fallbacks."""
        trace = trace if trace is not None else []
        ai = project.ai_config or ProjectAIConfig(
            name="Forge", role="Project Assistant", invocation_phrase="Forge"
        )

        trace.append(f"Invoking {ai.name} ({ai.role})...")

        # 1. Fetch Project Constitution and decisions
        constitution = await ConstitutionService.get_or_create_constitution(db, project.project_id, "system")
        constitution_md = await ConstitutionService.format_constitution_for_ai(db=db, project_id=project.project_id)
        
        try:
            cursor = db["decisions"].find({"project_id": project.project_id}).limit(10)
            decisions = await cursor.to_list(10)
        except Exception:
            decisions = []

        arch_graph = await build_project_architecture_graph(project.project_id, db)

        sources = [
            SourceCitation(
                source_type="constitution",
                source_id=f"Project Constitution v{constitution.version}",
                source_url="",
                relevance_score=1.0,
                content_preview=f"Authoritative tech stack, architecture ({constitution.sections.architecture.style or 'Standard'}), and coding conventions.",
            )
        ]
        if decisions:
            sources.append(
                SourceCitation(
                    source_type="decision",
                    source_id=f"{len(decisions)} Active Project Decisions",
                    source_url="",
                    relevance_score=0.95,
                    content_preview=f"Latest: {decisions[0].get('decision_text', '')[:80]}",
                )
            )

        # 2. Attempt High-Speed LLM Generation (OpenAI or Groq)
        assistant_content = ""
        llm_success = False

        # Build prompt
        project_context_formatted = f"""=== PROJECT METADATA ===
Name: {project.name}
Description: {project.description or 'No description provided'}

=== PROJECT CONSTITUTION (AUTHORITATIVE RULES) ===
{constitution_md}

=== ACTIVE ARCHITECTURAL DECISIONS ===
{chr(10).join(f"• {d.get('decision_text', '')}" for d in decisions) if decisions else 'No custom decisions recorded yet.'}"""

        system_prompt = f"""You are {ai.name}, the {ai.role} for project '{project.name}'.
Your core responsibilities:
1. Ground answers strictly and accurately in the Project Constitution and active Decisions provided below.
2. If asked about languages, frameworks, databases, tech stack, architecture style, coding rules, git workflow, API conventions, UI rules, or restrictions, ANSWER USING THE EXACT VALUES defined in the Project Constitution.
3. Be concise, direct, helpful, and actionable in markdown format.

{project_context_formatted}"""

        # Try Groq if configured
        if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("mock") and not llm_success:
            try:
                groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                completion = await asyncio.wait_for(
                    groq_client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_message},
                        ],
                        temperature=0.2,
                        max_tokens=450,
                    ),
                    timeout=4.0,
                )
                if completion.choices and completion.choices[0].message.content:
                    assistant_content = completion.choices[0].message.content.strip()
                    llm_success = True
            except Exception as gr_err:
                print(f"[ChatService Groq Fallback] {gr_err}")

        # Try OpenAI if configured
        if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("mock") and not llm_success:
            try:
                openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                completion = await asyncio.wait_for(
                    openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_message},
                        ],
                        temperature=0.2,
                        max_tokens=450,
                    ),
                    timeout=4.0,
                )
                if completion.choices and completion.choices[0].message.content:
                    assistant_content = completion.choices[0].message.content.strip()
                    llm_success = True
            except Exception as oa_err:
                print(f"[ChatService OpenAI Fallback] {oa_err}")

        # 3. If remote LLMs are unavailable, use the Cognitive Context Synthesis Engine
        if not assistant_content:
            assistant_content = cls._synthesize_cognitive_answer(
                query=user_message,
                project_name=project.name,
                ai_name=ai.name,
                ai_role=ai.role,
                constitution=constitution,
                decisions=decisions,
                arch_graph=arch_graph,
            )

        # 4. Persist assistant message
        assistant_msg = ChatMessageModel(
            id=str(ObjectId()),
            message_id=str(ObjectId()),
            project_id=project.project_id,
            user_id="ai",
            user_name=ai.name,
            user_avatar=None,
            role="assistant",
            content=assistant_content,
            sources=sources,
            is_ai_generated=True,
            is_ai_invocation=True,
            created_at=datetime.now(timezone.utc),
        )
        await db[cls.COLLECTION_NAME].insert_one(assistant_msg.model_dump(by_alias=True))
        return assistant_msg

    @classmethod
    async def get_chat_history(
        cls,
        db: AsyncIOMotorDatabase,
        project_id: str,
        limit: int = 50,
        before: Optional[datetime] = None,
    ) -> list[ChatMessageModel]:
        """Retrieve historical chat messages for a project with cursor pagination."""
        query: dict = {"project_id": project_id}
        if before:
            query["created_at"] = {"$lt": before}

        cursor = (
            db[cls.COLLECTION_NAME]
            .find(query)
            .sort("created_at", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        docs.reverse()
        return [ChatMessageModel(**d) for d in docs]

    @classmethod
    async def process_background_message_memory(
        cls,
        project_id: str,
        message_id: str,
        content: str,
        qdrant_collection_name: str,
    ) -> None:
        """Background worker to index human chat messages into project vector memory."""
        try:
            from app.services.memory_service import ProjectMemoryService
            memory_service = ProjectMemoryService()
            await memory_service.index_memory_item(
                project_id=project_id,
                source_type="chat_message",
                source_id=message_id,
                content=content,
                metadata={"type": "project_chat"},
                collection_name=qdrant_collection_name,
            )
        except Exception as e:
            print(f"[ChatService Memory Indexing Error] {e}")
