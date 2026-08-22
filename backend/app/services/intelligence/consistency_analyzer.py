from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.project_state import ConsistencyIssue, ConsistencyIssueType
from app.services.constitution_service import ConstitutionService


class ConsistencyAnalyzer:
    """Detects drift between documented Decisions, Constitution rules, and codebase evidence."""

    COLLECTION_NAME = "project_consistency_issues"

    async def analyze_consistency(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> list[ConsistencyIssue]:
        """Run consistency verification across Decisions, Constitution, and codebase artifacts."""
        issues: list[ConsistencyIssue] = []
        now = datetime.now(timezone.utc)

        # 1. Fetch active Constitution and Decisions
        constitution = await ConstitutionService.get_or_create_constitution(
            db=db, project_id=project_id, user_id="system"
        )
        c_tech = constitution.sections.technology
        const_languages = [l.lower() for l in (c_tech.languages or [])]
        const_frameworks = [f.lower() for f in (c_tech.frameworks or [])]
        const_databases = [d.lower() for d in (c_tech.databases or [])]
        const_arch_style = (constitution.sections.architecture.style or "").lower()
        restrictions = constitution.sections.general_rules.restrictions or []

        cursor_dec = db["decisions"].find({"project_id": project_id})
        decisions = await cursor_dec.to_list(length=100)

        # 2. Check Decision Status & Contradictions
        for dec in decisions:
            status = dec.get("status", "ACTIVE")
            text = dec.get("decision_text", "")
            lower_text = text.lower()

            # A. Explicit Conflicted Decisions
            if status == "CONFLICTED":
                # Find conflict partner if available
                conflict_doc = await db["decision_conflicts"].find_one({
                    "project_id": project_id,
                    "$or": [{"decision_id_a": dec.get("decision_id")}, {"decision_id_b": dec.get("decision_id")}],
                })
                explanation = conflict_doc.get("explanation") if conflict_doc else "Contradicts established project decisions or Constitution."
                issues.append(
                    ConsistencyIssue(
                        id=str(ObjectId()),
                        issue_id=f"conflict_dec_{dec.get('decision_id')}",
                        project_id=project_id,
                        issue_type=ConsistencyIssueType.DECISION_VS_CODE.value,
                        title=f"Conflicted Architectural Decision: {text[:60]}",
                        description=f"Decision '{text}' has been flagged as CONFLICTED: {explanation}",
                        documented_claim=text,
                        observed_evidence=f"Active Constitution v{constitution.version} or conflicting decision record.",
                        confidence="HIGH",
                        detected_at=now,
                    )
                )

            # B. Database Paradigm Contradictions
            if "postgres" in lower_text or "postgresql" in lower_text or "mysql" in lower_text or "sqlite" in lower_text:
                if const_databases and not any(r in const_databases for r in ["postgres", "postgresql", "mysql", "sqlite"]):
                    if any("mongo" in d for d in const_databases):
                        issues.append(
                            ConsistencyIssue(
                                id=str(ObjectId()),
                                issue_id=f"drift_db_{dec.get('decision_id')}",
                                project_id=project_id,
                                issue_type=ConsistencyIssueType.DECISION_VS_CODE.value,
                                title=f"Relational DB Decision vs NoSQL Constitution",
                                description=f"Decision '{text}' references SQL database, but Project Constitution standardizes on MongoDB.",
                                documented_claim=text,
                                observed_evidence=f"Project Constitution databases = {c_tech.databases}",
                                confidence="HIGH",
                                detected_at=now,
                            )
                        )

            # C. API Architecture Drift (GraphQL vs REST)
            if "graphql" in lower_text and "rest" in const_arch_style:
                issues.append(
                    ConsistencyIssue(
                        id=str(ObjectId()),
                        issue_id=f"drift_api_{dec.get('decision_id')}",
                        project_id=project_id,
                        issue_type=ConsistencyIssueType.DECISION_VS_CODE.value,
                        title="GraphQL Decision vs REST Constitution Agreement",
                        description=f"Decision specifies GraphQL, while Project Constitution v{constitution.version} enforces REST API architecture.",
                        documented_claim=text,
                        observed_evidence=f"Constitution architecture style = {constitution.sections.architecture.style}",
                        confidence="HIGH",
                        detected_at=now,
                    )
                )

        # 3. Check for Constitution Rules without Documented Rationale
        if const_databases and not decisions:
            issues.append(
                ConsistencyIssue(
                    id=str(ObjectId()),
                    issue_id=f"const_drift_no_dec_{project_id}",
                    project_id=project_id,
                    issue_type=ConsistencyIssueType.DOCUMENTATION_DRIFT.value,
                    title="Constitution Specified without Rationale Records",
                    description=f"Project Constitution defines {len(const_databases)} database(s) and {len(const_frameworks)} framework(s), but no formal decision rationales are logged.",
                    documented_claim=f"Constitution v{constitution.version}: {c_tech.languages + c_tech.frameworks + c_tech.databases}",
                    observed_evidence="Decision Log contains 0 records.",
                    confidence="MEDIUM",
                    detected_at=now,
                )
            )

        # 4. Check for Empty Restrictions or Rules
        if not restrictions:
            issues.append(
                ConsistencyIssue(
                    id=str(ObjectId()),
                    issue_id=f"const_no_restrictions_{project_id}",
                    project_id=project_id,
                    issue_type=ConsistencyIssueType.DOCUMENTATION_DRIFT.value,
                    title="Zero Hard Restrictions Specified in Constitution",
                    description="The Project Constitution currently has no strict restrictions defined, allowing unrestricted architectural choices.",
                    documented_claim="General Rules & Hard Restrictions: []",
                    observed_evidence="Zero restrictions configured in Section 7.",
                    confidence="MEDIUM",
                    detected_at=now,
                )
            )

        # Clear old issues and upsert fresh issues without modifying immutable _id
        await db[self.COLLECTION_NAME].delete_many({"project_id": project_id})
        for iss in issues:
            iss_data = iss.model_dump(by_alias=True)
            iss_data.pop("_id", None)
            await db[self.COLLECTION_NAME].insert_one(iss_data)

        cursor_res = db[self.COLLECTION_NAME].find({"project_id": project_id}).sort("detected_at", -1)
        docs = await cursor_res.to_list(length=50)
        
        parsed_issues: list[ConsistencyIssue] = []
        for d in docs:
            try:
                if "_id" in d:
                    d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d.get("_id", str(ObjectId()))
                ts = d.get("detected_at")
                if isinstance(ts, str):
                    d["detected_at"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                parsed_issues.append(ConsistencyIssue(**d))
            except Exception:
                pass

        return parsed_issues if parsed_issues else issues


