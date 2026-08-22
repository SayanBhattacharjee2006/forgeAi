import asyncio
import json
import math
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from openai import AsyncOpenAI
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_qdrant
from app.services.embedding_service import EmbeddingService
from app.services.constitution_service import ConstitutionService
from app.models.decision import (
    DecisionModel,
    DecisionConflictModel,
    DecisionStatus,
    ConflictInfo,
)


BULK_EXTRACTION_PROMPT = """Analyze the following project context (code files, commit logs, pull requests, and Discord conversations) and extract any architectural, design, or product decisions that the team has made.

For each decision found, provide:
- decision_text: A clear, concise statement of what was decided
- reasoning: Why this decision was made (if mentioned)
- alternatives_considered: List of alternatives that were discussed (if any)
- participants: List of people involved in the decision (usernames/names)
- source_type: "pr", "commit", "discord_message", or "github_file"
- source_id: The file path, PR number, commit SHA, or channel name
- source_url: The web URL of the source if provided in the context
- confidence_score: How confident you are this is a real decision (0.0-1.0)

Return a JSON array of decisions. If no decisions are found, return an empty array [].
Only extract REAL decisions — things like choosing a framework, database, architecture pattern, API design, dependency, UI library, etc.
Do NOT invent decisions that aren't in the context.

Context:
{context}

Respond with ONLY valid JSON array, no markdown formatting."""

EXTRACTION_PROMPT = """Analyze the following project content (conversation, PR, commit, or document) and determine if an ARCHITECTURAL, TECHNICAL, OR PRODUCT DECISION was made.

CRITERIA FOR A VALID DECISION:
- It must represent an AGREED or COMMITTED choice (e.g. choosing a database, framework, library, naming convention, API style, architecture pattern).
- General casual questions, brainstorming without consensus, or trivial status updates are NOT decisions (return "is_decision": false).

Provide a JSON object with:
- "is_decision": boolean
- "decision_text": Concise statement of what was decided (e.g., "Use MongoDB for primary document persistence")
- "reasoning": The justification or reasoning given (or empty string if not stated)
- "alternatives_considered": Array of alternative options mentioned (e.g. ["PostgreSQL", "DynamoDB"])
- "participants": Array of people involved in the decision
- "confidence_score": Float between 0.0 and 1.0

Context:
{context}

Respond with ONLY valid JSON."""


class DecisionService:
    """Service for non-destructive decision extraction, deduplication, conflict detection, and retrieval."""

    def __init__(self):
        self.openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-4o-mini"
        self.embedding_service = EmbeddingService()

    async def extract_decisions(
        self,
        project_id: str,
        collection_name: str,
        db: AsyncIOMotorDatabase,
    ) -> list[dict]:
        """Extract decisions from the project's knowledge base."""

        # 1. Fetch chunks from Qdrant using scroll
        qdrant = get_qdrant()
        
        # Use scroll to get points from the collection
        points, _ = await qdrant.scroll(
            collection_name=collection_name,
            limit=100,
            with_payload=True,
            with_vectors=False,
        )

        if not points:
            return []

        # 2. Build context from chunks
        context_parts = []
        for point in points:
            payload = point.payload
            source_type = payload.get("source_type", "unknown")
            content = payload.get("content", "")
            url = payload.get("url", "")
            
            if source_type == "github_file":
                label = f"[File: {payload.get('file_path', '')}] (URL: {url})"
            elif source_type in ("commit", "git_commit"):
                author = payload.get("author", "unknown")
                sha = payload.get("commit_sha", "")[:7]
                label = f"[Commit {sha} by {author}] (URL: {url})"
            elif source_type in ("pr", "pull_request", "github_pr"):
                pr_num = payload.get("pr_number", payload.get("source_id", ""))
                title = payload.get("title", "")
                label = f"[PR #{pr_num}: {title}] (URL: {url})"
            elif source_type in ("discord_message", "discord", "discord_thread"):
                author = payload.get("author", "unknown")
                channel = payload.get("channel", "general")
                label = f"[Discord #{channel} by {author}] (URL: {url})"
            elif source_type in ("chat", "group_chat"):
                author = payload.get("sender_name", "team")
                label = f"[Team Chat by {author}]"
            elif source_type == "file_summary":
                label = f"[File Summary: {payload.get('file_path', '')}]"
            else:
                label = f"[{source_type}] (URL: {url})"
            
            context_parts.append(f"{label}\n{content}")

        context = "\n\n---\n\n".join(context_parts)

        # 3. Call gpt-4o-mini to extract decisions
        try:
            completion = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a technical analyst that extracts architectural and product decisions from project artifacts. Always respond with valid JSON."},
                    {"role": "user", "content": BULK_EXTRACTION_PROMPT.format(context=context)},
                ],
                temperature=0.2,
                max_tokens=2048,
            )
            
            raw_response = completion.choices[0].message.content.strip()
            # Clean potential markdown wrapping
            if raw_response.startswith("```"):
                raw_response = raw_response.split("\n", 1)[1]
                raw_response = raw_response.rsplit("```", 1)[0]
            
            decisions_data = json.loads(raw_response)
        except (json.JSONDecodeError, Exception) as e:
            print(f"Failed to parse decisions: {e}")
            return []

        # 4. Save decisions to MongoDB
        saved_decisions = []
        for d in decisions_data:
            decision = DecisionModel(
                decision_id=str(ObjectId()),
                project_id=project_id,
                decision_text=d.get("decision_text", ""),
                reasoning=d.get("reasoning", ""),
                alternatives_considered=d.get("alternatives_considered", []),
                participants=d.get("participants", []),
                source_type=d.get("source_type", "unknown"),
                source_id=d.get("source_id", ""),
                source_url=d.get("source_url", ""),
                status=DecisionStatus.ACTIVE.value,
                timestamp=datetime.now(timezone.utc),
                extracted_at=datetime.now(timezone.utc),
                confidence_score=d.get("confidence_score", 0.5),
            )
            await db["decisions"].insert_one(decision.model_dump(by_alias=True))
            saved_decisions.append(decision)

        return [d.model_dump() for d in saved_decisions]

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        """Calculate cosine similarity between two vector embeddings."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def extract_decision_candidate(
        self,
        project_id: str,
        text: str,
        source_type: str,
        source_id: str,
        source_url: str,
        db: AsyncIOMotorDatabase,
    ) -> Optional[DecisionModel]:
        """Extract a single decision from a message/event and process deduplication/conflict."""
        if not text or len(text.strip()) < 10:
            return None

        try:
            completion = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a software architect analyzing project communication to extract technical decisions. Always respond with valid JSON.",
                    },
                    {"role": "user", "content": EXTRACTION_PROMPT.format(context=text)},
                ],
                temperature=0.1,
                max_tokens=400,
            )
            raw = completion.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                raw = raw.rsplit("```", 1)[0]

            data = json.loads(raw)
            if not data.get("is_decision") or not data.get("decision_text"):
                return None

            candidate = DecisionModel(
                decision_id=str(ObjectId()),
                project_id=project_id,
                decision_text=data["decision_text"].strip(),
                reasoning=data.get("reasoning", "").strip(),
                alternatives_considered=data.get("alternatives_considered", []),
                participants=data.get("participants", []),
                source_type=source_type,
                source_id=source_id,
                source_url=source_url,
                status=DecisionStatus.ACTIVE.value,
                confidence_score=float(data.get("confidence_score", 0.8)),
                timestamp=datetime.now(timezone.utc),
                extracted_at=datetime.now(timezone.utc),
            )

            # Deduplication and Supersession Check against existing project decisions
            saved_decision = await self._reconcile_and_save_decision(candidate, db)
            return saved_decision

        except Exception as e:
            print(f"[DecisionService] Extraction error: {e}")
            return None

    async def _reconcile_and_save_decision(
        self,
        candidate: DecisionModel,
        db: AsyncIOMotorDatabase,
    ) -> DecisionModel:
        """Compare candidate against active project decisions for duplicates, supersession, or conflicts."""
        # Find active decisions for this project
        cursor = db["decisions"].find({
            "project_id": candidate.project_id,
            "status": {"$in": [DecisionStatus.ACTIVE.value, DecisionStatus.CONFLICTED.value]},
        })
        existing_decisions = [DecisionModel(**doc) async for doc in cursor]

        if not existing_decisions:
            await db["decisions"].insert_one(candidate.model_dump(by_alias=True))
            return candidate

        # Fast cosine similarity pre-filtering
        candidate_embedding = await self.embedding_service.generate_single_embedding(candidate.decision_text)
        existing_texts = [d.decision_text for d in existing_decisions]
        existing_embeddings = await self.embedding_service.generate_embeddings(existing_texts)

        # Check for high similarity matches
        for existing, emb in zip(existing_decisions, existing_embeddings):
            sim = self._cosine_similarity(candidate_embedding, emb)
            if sim >= 0.75:
                # LLM relationship check
                prompt = f"""Decision A (Existing): {existing.decision_text}
Reasoning A: {existing.reasoning}

Decision B (New Candidate): {candidate.decision_text}
Reasoning B: {candidate.reasoning}

Classify the relationship between Decision A and Decision B:
- "duplicate": Both express the same decision (ignore new one)
- "supersedes": Decision B updates/replaces Decision A
- "conflicts": Both are current and mutually incompatible
- "unrelated": Different topics despite similar words

Respond with ONLY valid JSON: {{"relationship": "duplicate"|"supersedes"|"conflicts"|"unrelated", "explanation": "brief reasoning"}}"""

                try:
                    res = await self.openai.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": "You are a technical analyst evaluating software decision relationships. Return JSON only."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.1,
                        max_tokens=150,
                    )
                    parsed = json.loads(res.choices[0].message.content.strip().strip("`").removeprefix("json").strip())
                    rel = parsed.get("relationship", "unrelated")
                    explanation = parsed.get("explanation", "")

                    if rel == "duplicate":
                        print(f"[DecisionService] Ignored duplicate decision: '{candidate.decision_text}'")
                        return existing

                    elif rel == "supersedes":
                        # Mark old decision as SUPERSEDED
                        await db["decisions"].update_one(
                            {"decision_id": existing.decision_id},
                            {"$set": {
                                "status": DecisionStatus.SUPERSEDED.value,
                                "superseded_by": candidate.decision_id,
                                "updated_at": datetime.now(timezone.utc),
                            }}
                        )
                        candidate.supersedes = existing.decision_id
                        candidate.status = DecisionStatus.ACTIVE.value
                        await db["decisions"].insert_one(candidate.model_dump(by_alias=True))
                        print(f"[DecisionService] Decision '{candidate.decision_id}' superseded '{existing.decision_id}'")
                        return candidate

                    elif rel == "conflicts":
                        # Mark both as CONFLICTED
                        await db["decisions"].update_one(
                            {"decision_id": existing.decision_id},
                            {"$set": {
                                "status": DecisionStatus.CONFLICTED.value,
                                "updated_at": datetime.now(timezone.utc),
                            }}
                        )
                        candidate.status = DecisionStatus.CONFLICTED.value
                        await db["decisions"].insert_one(candidate.model_dump(by_alias=True))

                        conflict = DecisionConflictModel(
                            project_id=candidate.project_id,
                            decision_id_a=existing.decision_id,
                            decision_id_b=candidate.decision_id,
                            relationship="conflict",
                            explanation=explanation,
                        )
                        await db["decision_conflicts"].insert_one(conflict.model_dump(by_alias=True))
                        print(f"[DecisionService] Recorded conflict between '{existing.decision_id}' and '{candidate.decision_id}'")
                        return candidate

                except Exception as e:
                    print(f"[DecisionService] Candidate reconciliation error: {e}")

        # If unrelated to any existing decisions, insert as active
        await db["decisions"].insert_one(candidate.model_dump(by_alias=True))
        return candidate

    async def extract_decisions(
        self,
        project_id: str,
        collection_name: str,
        db: AsyncIOMotorDatabase,
    ) -> list[dict]:
        """Extract decisions non-destructively from Qdrant chunks without deleting existing decisions."""
        qdrant = get_qdrant()
        points, _ = await qdrant.scroll(
            collection_name=collection_name,
            limit=40,
            with_payload=True,
            with_vectors=False,
        )

        if not points:
            return []

        context_parts = []
        for point in points:
            payload = point.payload
            source_type = payload.get("source_type", "unknown")
            content = payload.get("content", "")
            if len(content.strip()) < 40:
                continue

            if source_type == "github_file":
                label = f"[File: {payload.get('file_path', '')}]"
            elif source_type == "discord_message":
                author = payload.get("author", "unknown")
                channel = payload.get("channel", "unknown")
                label = f"[Discord #{channel} by {author}]"
            elif source_type == "chat_message":
                author = payload.get("user_name", "Team")
                label = f"[Project Chat by {author}]"
            else:
                label = f"[{source_type}]"

            context_parts.append(f"{label}\n{content}")

        if not context_parts:
            return []

        context = "\n\n---\n\n".join(context_parts[:20])

        try:
            completion = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a technical analyst that extracts architectural and product decisions. Respond with ONLY valid JSON array of objects with keys: decision_text, reasoning, alternatives_considered, participants, source_type, source_id, confidence_score.",
                    },
                    {"role": "user", "content": f"Context:\n{context}\n\nExtract decisions JSON array:"},
                ],
                temperature=0.2,
                max_tokens=2048,
            )

            raw = completion.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                raw = raw.rsplit("```", 1)[0]

            decisions_data = json.loads(raw)
            if not isinstance(decisions_data, list):
                decisions_data = []

        except Exception as e:
            print(f"[DecisionService] Batch extraction parse error: {e}")
            return []

        saved_decisions = []
        for d in decisions_data:
            if not d.get("decision_text"):
                continue
            cand = DecisionModel(
                decision_id=str(ObjectId()),
                project_id=project_id,
                decision_text=d.get("decision_text", "").strip(),
                reasoning=d.get("reasoning", "").strip(),
                alternatives_considered=d.get("alternatives_considered", []),
                participants=d.get("participants", []),
                source_type=d.get("source_type", "github_file"),
                source_id=d.get("source_id", "project_artifact"),
                source_url="",
                status=DecisionStatus.ACTIVE.value,
                confidence_score=float(d.get("confidence_score", 0.8)),
                timestamp=datetime.now(timezone.utc),
                extracted_at=datetime.now(timezone.utc),
            )
            saved = await self._reconcile_and_save_decision(cand, db)
            saved_decisions.append(saved.model_dump())

        return saved_decisions

    async def detect_conflicts(
        self,
        project_id: str,
        db: AsyncIOMotorDatabase,
        similarity_threshold: float = 0.55,
    ) -> list[dict]:
        """Pairwise semantic comparison across all active project decisions and Constitution for conflicts or supersessions."""
        # 1. Backfill any decisions with status == None or missing
        await db["decisions"].update_many(
            {"project_id": project_id, "status": None},
            {"$set": {"status": DecisionStatus.ACTIVE.value}},
        )

        # 2. Fetch all non-superseded decisions
        cursor = db["decisions"].find({
            "project_id": project_id,
            "status": {"$nin": [DecisionStatus.SUPERSEDED.value, "REJECTED", "superseded", "rejected"]},
        }).sort("timestamp", 1)
        decisions = await cursor.to_list(length=300)

        if len(decisions) < 1:
            return []

        # Clear old conflicts before re-evaluating
        await db["decision_conflicts"].delete_many({"project_id": project_id})

        # Reset previously conflicted decisions to ACTIVE so fresh clean evaluation occurs
        await db["decisions"].update_many(
            {"project_id": project_id, "status": DecisionStatus.CONFLICTED.value},
            {"$set": {"status": DecisionStatus.ACTIVE.value}},
        )

        # 3. Load Project Constitution for authoritative grounding
        const_md = ""
        has_const = False
        try:
            const_md = await ConstitutionService.format_constitution_for_ai(db=db, project_id=project_id)
            has_const = "### Project Constitution" in const_md
        except Exception as err:
            print(f"[DecisionService] Constitution fetch warning during conflict scan: {err}")

        saved_conflicts = []

        # 4. Pairwise decision conflict & supersession detection
        if len(decisions) >= 2:
            texts = [d["decision_text"] for d in decisions]
            embeddings = await self.embedding_service.generate_embeddings(texts)

            # Pre-filter candidate pairs by semantic similarity or small pool evaluation
            candidate_pairs = []
            for i in range(len(decisions)):
                for j in range(i + 1, len(decisions)):
                    sim = self._cosine_similarity(embeddings[i], embeddings[j])
                    # If similarity is >= threshold (or if small set <= 20 decisions, test any pair >= 0.50)
                    min_sim = 0.50 if len(decisions) <= 20 else similarity_threshold
                    if sim >= min_sim:
                        candidate_pairs.append((i, j, sim))

            # Concurrently evaluate candidate pairs with LLM
            async def evaluate_pair(i: int, j: int, sim: float):
                dec_a, dec_b = decisions[i], decisions[j]
                prompt = f"""Decision A (Logged: {dec_a.get('timestamp')}): "{dec_a['decision_text']}"
Reasoning A: {dec_a.get('reasoning', 'None')}

Decision B (Logged: {dec_b.get('timestamp')}): "{dec_b['decision_text']}"
Reasoning B: {dec_b.get('reasoning', 'None')}

Analyze the architectural, technological, and procedural relationship between Decision A and Decision B:
- "conflict": They express contradictory, incompatible, or mutually exclusive technical choices (e.g., opposing database paradigms, conflicting tools, incompatible routing).
- "supersedes": One decision explicitly updates, modernizes, or replaces the older decision.
- "duplicate": Both decisions express the exact same technical choice or rule (duplicate record).
- "unrelated": The decisions address different technical concerns or can cleanly coexist without contradiction.

Respond with ONLY valid JSON: {{"relationship": "conflict"|"supersedes"|"duplicate"|"unrelated", "explanation": "Clear, concise rationale"}}"""

                try:
                    res = await self.openai.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": "You are a software architect analyzing technical decisions. Return JSON only."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.1,
                        max_tokens=200,
                    )
                    raw = res.choices[0].message.content.strip().strip("`").removeprefix("json").strip()
                    result = json.loads(raw)
                    return (dec_a, dec_b, result.get("relationship", "unrelated"), result.get("explanation", ""))
                except Exception as e:
                    print(f"[DecisionService] Pair eval error ({i},{j}): {e}")
                    return None

            tasks = [evaluate_pair(i, j, sim) for i, j, sim in candidate_pairs]
            pair_results = await asyncio.gather(*tasks)

            for item in pair_results:
                if not item:
                    continue
                dec_a, dec_b, relationship, explanation = item
                if relationship == "unrelated":
                    continue

                if relationship == "conflict":
                    await db["decisions"].update_many(
                        {"decision_id": {"$in": [dec_a["decision_id"], dec_b["decision_id"]]}},
                        {"$set": {"status": DecisionStatus.CONFLICTED.value, "updated_at": datetime.now(timezone.utc)}},
                    )
                elif relationship == "supersedes":
                    await db["decisions"].update_one(
                        {"decision_id": dec_a["decision_id"]},
                        {"$set": {
                            "status": DecisionStatus.SUPERSEDED.value,
                            "superseded_by": dec_b["decision_id"],
                            "updated_at": datetime.now(timezone.utc),
                        }},
                    )
                    await db["decisions"].update_one(
                        {"decision_id": dec_b["decision_id"]},
                        {"$set": {
                            "supersedes": dec_a["decision_id"],
                            "updated_at": datetime.now(timezone.utc),
                        }},
                    )
                elif relationship == "duplicate":
                    await db["decisions"].update_one(
                        {"decision_id": dec_a["decision_id"]},
                        {"$set": {
                            "status": DecisionStatus.SUPERSEDED.value,
                            "superseded_by": dec_b["decision_id"],
                            "updated_at": datetime.now(timezone.utc),
                        }},
                    )
                    relationship = "superseded_by"
                    explanation = f"Duplicate record: superseded by decision {dec_b['decision_id'][:8]}"

                conflict = DecisionConflictModel(
                    project_id=project_id,
                    decision_id_a=dec_a["decision_id"],
                    decision_id_b=dec_b["decision_id"],
                    relationship=relationship,
                    explanation=explanation,
                )
                await db["decision_conflicts"].insert_one(conflict.model_dump(by_alias=True))
                saved_conflicts.append(conflict.model_dump())

        # 5. Scan active decisions against the Project Constitution
        if has_const:
            async def evaluate_const_conflict(dec: dict):
                prompt = f"""PROJECT CONSTITUTION:
{const_md}

DECISION TO CHECK:
"{dec['decision_text']}"
Reasoning: {dec.get('reasoning', 'None')}

Determine if this decision violates or directly contradicts any rule, technology, framework, database, API style, or convention in the Project Constitution.
Respond with ONLY valid JSON: {{"violates_constitution": true|false, "explanation": "Why it violates the constitution (or empty if valid)"}}"""
                try:
                    res = await self.openai.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": "You are a software architect checking compliance against the authoritative Project Constitution. Return JSON only."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.1,
                        max_tokens=200,
                    )
                    raw = res.choices[0].message.content.strip().strip("`").removeprefix("json").strip()
                    parsed = json.loads(raw)
                    if parsed.get("violates_constitution"):
                        return (dec, parsed.get("explanation", "Violates Project Constitution rules."))
                except Exception as e:
                    print(f"[DecisionService] Constitution conflict eval error: {e}")
                return None

            active_docs = await db["decisions"].find({
                "project_id": project_id,
                "status": DecisionStatus.ACTIVE.value,
            }).to_list(100)

            const_tasks = [evaluate_const_conflict(d) for d in active_docs]
            const_results = await asyncio.gather(*const_tasks)

            for res in const_results:
                if not res:
                    continue
                dec, expl = res
                await db["decisions"].update_one(
                    {"decision_id": dec["decision_id"]},
                    {"$set": {"status": DecisionStatus.CONFLICTED.value, "updated_at": datetime.now(timezone.utc)}}
                )
                const_conflict = DecisionConflictModel(
                    project_id=project_id,
                    decision_id_a=dec["decision_id"],
                    decision_id_b=f"constitution:{project_id}",
                    relationship="conflict",
                    explanation=f"Constitution Conflict: {expl}",
                )
                await db["decision_conflicts"].insert_one(const_conflict.model_dump(by_alias=True))
                saved_conflicts.append(const_conflict.model_dump())

        return saved_conflicts

    async def get_relevant_decisions(
        self,
        project_id: str,
        query_text: str,
        db: AsyncIOMotorDatabase,
        limit: int = 4,
    ) -> list[DecisionModel]:
        """Retrieve relevant project decisions for grounding Project Context."""
        cursor = db["decisions"].find({
            "project_id": project_id,
            "status": {"$in": [DecisionStatus.ACTIVE.value, DecisionStatus.CONFLICTED.value]},
        }).sort("timestamp", -1)
        all_active = [DecisionModel(**doc) async for doc in cursor]

        if not all_active:
            return []

        # If query contains decision signals or keywords, rank semantically
        query_embedding = await self.embedding_service.generate_single_embedding(query_text)
        decision_texts = [f"{d.decision_text} {d.reasoning}" for d in all_active]
        embeddings = await self.embedding_service.generate_embeddings(decision_texts)

        scored = []
        for dec, emb in zip(all_active, embeddings):
            score = self._cosine_similarity(query_embedding, emb)
            if score >= 0.40:
                scored.append((score, dec))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [dec for _, dec in scored[:limit]]
