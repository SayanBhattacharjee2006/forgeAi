from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db, get_qdrant
from app.api.v1.dependencies import get_current_user
from app.api.v1.permissions import ProjectContext, require_project_member, require_project_owner
from app.models.user import UserModel
from app.models.project import (
    InviteSchema,
    JoinRequestSchema,
    MemberDetail,
    MemberRoleUpdate,
    ProjectAIConfig,
    ProjectAIConfigUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectRole,
    ProjectSettingsUpdate,
    ProjectUpdate,
)
from app.services.project_service import ProjectService
from app.services.queue_service import enqueue_github_job
from app.services.user_service import UserService
from app.services.github_service import GitHubIngestionService, run_github_ingestion
from app.services.discord_service import DiscordIngestionService
from app.core.security import decrypt_token

router = APIRouter()


class GitHubConnectRequest(BaseModel):
    github_repo_url: str
    github_branch: str = "main"


class DiscordConnectRequest(BaseModel):
    discord_guild_id: str
    discord_channels: list[str] = []


class DiscordChannelsRequest(BaseModel):
    discord_channels: list[str] = []


class ActivityItem(BaseModel):
    id: str
    type: str  # "commit" | "pr" | "discord" | "decision" | "chat" | "member" | "sync"
    title: str
    description: str = ""
    author: str = ""
    source: str = ""
    timestamp: str = ""
    url: str = ""


# ==================== Project Collection Endpoints ====================

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new project workspace."""
    service = ProjectService(db)
    return await service.create_project(current_user, project_data)


@router.get("", response_model=list[ProjectResponse])
@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all projects the current user is a member of or owns."""
    service = ProjectService(db)
    return await service.list_projects(current_user.user_id)


# ==================== Join Requests ====================

@router.post("/join/request")
async def request_join(
    data: JoinRequestSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Request to join a project using a join code."""
    service = ProjectService(db)
    return await service.request_join(data.join_code, current_user.user_id)


@router.get("/join/pending", response_model=list[ProjectResponse])
@router.get("/join/pending/", response_model=list[ProjectResponse])
async def get_my_pending_projects(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get all projects where the current user has sent a join request that is pending approval."""
    service = ProjectService(db)
    return await service.get_my_pending_projects(current_user.user_id)


# ==================== Global Activity ====================

def format_utc_timestamp(val) -> str:
    if val is None:
        return datetime.now(timezone.utc).isoformat()
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.isoformat()
    s = str(val).strip()
    if not s:
        return datetime.now(timezone.utc).isoformat()
    if not s.endswith("Z") and not ("+" in s[-6:] or ("-" in s[-6:] and "T" in s)):
        return s + "Z"
    return s


@router.get("/activity/all", response_model=list[ActivityItem])
async def get_all_recent_activity(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Fetch global recent activity across all projects the user is a member of."""
    cursor = db["projects"].find({
        "$or": [
            {"members": current_user.user_id},
            {"owner_id": current_user.user_id},
            {f"member_roles.{current_user.user_id}": {"$exists": True}},
        ]
    })
    user_projects = await cursor.to_list(length=50)
    if not user_projects:
        return []

    project_ids = [p["project_id"] for p in user_projects]
    project_map = {p["project_id"]: p.get("name", "Project") for p in user_projects}

    activities: list[dict] = []

    # 1. Decisions across all user projects
    dec_cursor = db["decisions"].find({"project_id": {"$in": project_ids}}).sort("timestamp", -1).limit(15)
    async for dec in dec_cursor:
        pid = dec.get("project_id", "")
        pname = project_map.get(pid, "Project")
        activities.append({
            "id": f"dec_{dec.get('_id')}",
            "type": "decision",
            "title": f"Decision: {dec.get('decision_text', '')[:90]}",
            "description": dec.get("reasoning", "")[:150],
            "author": ", ".join(dec.get("participants", [])) or "Forge AI",
            "source": f"{pname} • Decision",
            "timestamp": format_utc_timestamp(dec.get("timestamp") or dec.get("extracted_at")),
            "url": dec.get("source_url", f"/project/{pid}/decisions"),
        })

    # 2. Group Chat messages across user projects
    gc_cursor = db["group_chat_history"].find({"project_id": {"$in": project_ids}}).sort("created_at", -1).limit(15)
    async for msg in gc_cursor:
        pid = msg.get("project_id", "")
        pname = project_map.get(pid, "Project")
        activities.append({
            "id": f"gc_{msg.get('_id')}",
            "type": "chat",
            "title": f"{msg.get('user_name', 'Member')}: {msg.get('content', '')[:80]}",
            "description": msg.get("content", "")[:150],
            "author": msg.get("user_name", "Team Member"),
            "source": f"{pname} • Team Chat",
            "timestamp": format_utc_timestamp(msg.get("created_at")),
            "url": f"/project/{pid}/group-chat",
        })

    # 3. Project creations & GitHub sync status
    for p in user_projects:
        pid = p.get("project_id", "")
        pname = p.get("name", "Project")
        ingestion = p.get("ingestion_status", {})
        if ingestion.get("github_backfill_complete"):
            activities.append({
                "id": f"sync_gh_{pid}",
                "type": "commit",
                "title": f"GitHub Indexed: {p.get('github_repo_name') or 'Repository'}",
                "description": f"{ingestion.get('github_chunks_count', 0)} chunks vectorized",
                "author": "GitHub Integration",
                "source": f"{pname} • GitHub Sync",
                "timestamp": format_utc_timestamp(ingestion.get("last_github_sync") or p.get("updated_at")),
                "url": p.get("github_repo_url", ""),
            })

        activities.append({
            "id": f"proj_{pid}",
            "type": "member",
            "title": f"Project '{pname}' created",
            "description": p.get("description") or "Workspace active",
            "author": "Project Owner",
            "source": f"{pname} • Workspace",
            "timestamp": format_utc_timestamp(p.get("created_at")),
            "url": f"/project/{pid}",
        })

    def parse_time(item):
        ts = item.get("timestamp")
        if isinstance(ts, datetime):
            return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
        if isinstance(ts, str):
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
            except Exception:
                pass
        return datetime.min.replace(tzinfo=timezone.utc)

    activities.sort(key=parse_time, reverse=True)
    for item in activities:
        item["timestamp"] = format_utc_timestamp(item.get("timestamp"))
    return [ActivityItem(**item) for item in activities[:25]]


# ==================== Individual Project Workspaces ====================

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get a specific project workspace by ID (Members only)."""
    service = ProjectService(ctx.db)
    return await service.build_project_response(ctx.project, ctx.user.user_id)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    update_data: ProjectUpdate,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Update a project's settings (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.update_project(ctx.project, update_data, ctx.user.user_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Delete a project and its associated data (Owner only)."""
    service = ProjectService(ctx.db)
    await service.delete_project(ctx.project)


# ==================== Project Settings & AI Configuration ====================

@router.get("/{project_id}/settings", response_model=ProjectResponse)
async def get_project_settings(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get project configuration and settings (Members only)."""
    service = ProjectService(ctx.db)
    return await service.build_project_response(ctx.project, ctx.user.user_id)


@router.put("/{project_id}/settings", response_model=ProjectResponse)
async def update_project_settings(
    project_id: str,
    settings_data: ProjectSettingsUpdate,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Update project configuration and settings (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.update_project(ctx.project, settings_data, ctx.user.user_id)


@router.get("/{project_id}/ai-config", response_model=ProjectAIConfig)
async def get_ai_config(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get project AI persona and configuration (Members only)."""
    service = ProjectService(ctx.db)
    return await service.get_ai_config(ctx.project)


@router.put("/{project_id}/ai-config", response_model=ProjectAIConfig)
async def update_ai_config(
    project_id: str,
    ai_config: ProjectAIConfigUpdate,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Update project AI persona and configuration (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.update_ai_config(ctx.project, ai_config)


# ==================== Members & Roles ====================

@router.get("/{project_id}/members", response_model=list[MemberDetail])
async def list_members(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """List all project members and their roles (Members only)."""
    service = ProjectService(ctx.db)
    return await service.get_members(ctx.project)


@router.post("/{project_id}/members/invite", response_model=MemberDetail)
@router.post("/{project_id}/invite", response_model=MemberDetail)
async def invite_member(
    project_id: str,
    data: InviteSchema,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Invite a user by GitHub username (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.invite_member(ctx.project, data.github_username)


@router.delete("/{project_id}/members/{user_id}")
async def remove_member(
    project_id: str,
    user_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Remove a member from the project. Owner can remove any member; member can leave project."""
    # If actor is not owner and is trying to remove someone else, reject
    if ctx.role != ProjectRole.OWNER.value and ctx.user.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only remove yourself from this project.",
        )

    service = ProjectService(ctx.db)
    await service.remove_member(ctx.project, user_id, ctx.user.user_id)
    return {"message": "Member removed successfully"}


@router.put("/{project_id}/members/{user_id}/role", response_model=MemberDetail)
async def update_member_role(
    project_id: str,
    user_id: str,
    role_data: MemberRoleUpdate,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Update a member's role between OWNER and MEMBER (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.update_member_role(ctx.project, user_id, role_data.role, ctx.user.user_id)


# ==================== Join Requests Management ====================

@router.get("/{project_id}/join/requests")
async def get_join_requests(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Get pending join requests for a project (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.get_join_requests(ctx.project)


@router.post("/{project_id}/join/approve/{user_id}")
@router.post("/{project_id}/join/requests/{user_id}/approve")
async def approve_join(
    project_id: str,
    user_id: str,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Approve a join request (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.approve_join_request(ctx.project, user_id)


@router.post("/{project_id}/join/reject/{user_id}")
@router.post("/{project_id}/join/requests/{user_id}/reject")
async def reject_join(
    project_id: str,
    user_id: str,
    ctx: ProjectContext = Depends(require_project_owner),
):
    """Reject a join request (Owner only)."""
    service = ProjectService(ctx.db)
    return await service.reject_join_request(ctx.project, user_id)


# ==================== Ingestion & Activity ====================

@router.post("/{project_id}/ingest/github")
@router.post("/{project_id}/sync/github")
async def trigger_github_ingestion(
    project_id: str,
    background_tasks: BackgroundTasks,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Trigger background ingestion of the GitHub repository (Members only)."""
    raw_repo = ctx.project.github_repo_name or ctx.project.github_repo_url
    if not raw_repo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project has no GitHub repository configured",
        )

    # Get user's decrypted GitHub token if available
    user_service = UserService(ctx.db)
    user = await user_service.get_by_id(ctx.user.user_id)

    decrypted_token = ""
    if user and user.github_access_token:
        try:
            decrypted_token = decrypt_token(user.github_access_token)
        except Exception:
            decrypted_token = ""

    # Fallback to system GITHUB_TOKEN if user token is empty
    if not decrypted_token:
        decrypted_token = getattr(settings, "GITHUB_TOKEN", "") or getattr(settings, "GITHUB_PERSONAL_ACCESS_TOKEN", "")

    # Enqueue job (try RQ Redis first, fallback to async background tasks)
    from app.services.github_service import run_github_ingestion

    try:
        job_info = enqueue_github_job(run_github_ingestion, project_id=project_id, access_token=decrypted_token)
        return {"message": "Ingestion started", "job_id": job_info["job_id"]}
    except Exception as err:
        print(f"RQ enqueue failed ({err}), running via FastAPI background tasks...")
        from app.services.github_service import GitHubIngestionService

        svc = GitHubIngestionService(project_id, decrypted_token)
        background_tasks.add_task(svc.ingest_repository)
        return {"message": "Ingestion started via background worker", "job_id": f"bg_{project_id}"}


@router.get("/{project_id}/activity", response_model=list[ActivityItem])
async def get_project_activity(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Fetch real activity timeline for a project (Members only)."""
    doc = ctx.project
    activities: list[dict] = []

    # 1. Decisions extracted for this project
    decisions_cursor = ctx.db["decisions"].find({"project_id": project_id}).sort("timestamp", -1).limit(10)
    async for dec in decisions_cursor:
        activities.append({
            "id": f"dec_{dec.get('_id')}",
            "type": "decision",
            "title": f"Decision: {dec.get('decision_text', '')[:100]}",
            "description": dec.get("reasoning", "")[:180],
            "author": ", ".join(dec.get("participants", [])) or "Forge AI",
            "source": f"Decision Engine ({dec.get('source_type', 'AI')})",
            "timestamp": format_utc_timestamp(dec.get("timestamp") or dec.get("extracted_at")),
            "url": dec.get("source_url", f"/project/{project_id}/decisions"),
        })

    # 2. Team Group Chat Messages
    chat_cursor = ctx.db["group_chat_history"].find({"project_id": project_id}).sort("created_at", -1).limit(15)
    async for msg in chat_cursor:
        activities.append({
            "id": f"gc_{msg.get('_id')}",
            "type": "chat",
            "title": f"{msg.get('user_name', 'Team Member')}: {msg.get('content', '')[:90]}",
            "description": msg.get("content", "")[:180],
            "author": msg.get("user_name", "Team Member"),
            "source": "Team Group Chat",
            "timestamp": format_utc_timestamp(msg.get("created_at")),
            "url": f"/project/{project_id}/group-chat",
        })

    # 3. Discord Messages from Qdrant vector memory
    try:
        qdrant = get_qdrant()
        coll_name = doc.qdrant_collection_name or f"forge_{project_id}"
        records, _ = await qdrant.scroll(
            collection_name=coll_name,
            scroll_filter={
                "must": [
                    {"key": "source_type", "match": {"value": "discord_message"}}
                ]
            },
            limit=10,
            with_payload=True,
        )
        for pt in records:
            p = pt.payload or {}
            activities.append({
                "id": f"disc_{pt.id}",
                "type": "discord",
                "title": f"Discord @{p.get('author', 'member')}: {p.get('text', '')[:80]}",
                "description": p.get("text", "")[:180],
                "author": p.get("author", "Discord Member"),
                "source": f"Discord #{p.get('channel', 'general')}",
                "timestamp": format_utc_timestamp(p.get("timestamp")),
                "url": "",
            })
    except Exception:
        pass

    # 4. GitHub Sync Activity
    ingestion = doc.ingestion_status
    if ingestion and ingestion.github_backfill_complete:
        activities.append({
            "id": f"sync_gh_{doc.project_id}",
            "type": "commit",
            "title": f"GitHub Indexed: {doc.github_repo_name or 'Repository'}",
            "description": f"{ingestion.github_chunks_count} chunks vectorized and available for AI search",
            "author": "GitHub Integration",
            "source": "GitHub Sync",
            "timestamp": format_utc_timestamp(getattr(ingestion, "last_github_sync", None) or getattr(doc, "updated_at", None)),
            "url": doc.github_repo_url or "",
        })

    # 5. Project Workspace Creation
    activities.append({
        "id": f"proj_{doc.project_id}",
        "type": "member",
        "title": f"Project '{doc.name}' created",
        "description": doc.description or "Project workspace initialized",
        "author": "Project Owner",
        "source": "Forge Workspace",
        "timestamp": format_utc_timestamp(getattr(doc, "created_at", None)),
        "url": "",
    })

    def parse_time(item):
        ts = item.get("timestamp")
        if isinstance(ts, datetime):
            return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
        if isinstance(ts, str):
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
            except Exception:
                pass
        return datetime.min.replace(tzinfo=timezone.utc)

    activities.sort(key=parse_time, reverse=True)
    for item in activities:
        item["timestamp"] = format_utc_timestamp(item.get("timestamp"))
    return [ActivityItem(**item) for item in activities[:20]]


# ==================== Step 6 & 7: GitHub & Discord Endpoints ====================

@router.post("/{project_id}/github/connect")
async def connect_github_repo(
    body: GitHubConnectRequest,
    context: ProjectContext = Depends(require_project_owner),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Connect a GitHub repository and branch to the project."""
    repo_url = body.github_repo_url.strip()
    branch = body.github_branch.strip() or "main"
    service = ProjectService(db)
    updated = await service.update_project(
        context.project,
        ProjectSettingsUpdate(github_repo_url=repo_url, github_branch=branch),
        current_user_id=context.project.owner_id,
    )
    return {"message": "GitHub repository connected successfully", "project": updated}


@router.post("/{project_id}/github/disconnect")
async def disconnect_github_repo(
    context: ProjectContext = Depends(require_project_owner),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Disconnect GitHub repository and purge memory vectors."""
    success = await GitHubIngestionService.disconnect_repository(context.project.project_id, db)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to disconnect repository")
    return {"message": "GitHub repository disconnected and memory purged"}


@router.post("/{project_id}/github/webhook")
async def github_webhook(
    project_id: str,
    payload: dict,
    event_type: str = "push",
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Handle incoming GitHub push and pull_request webhook events."""
    await GitHubIngestionService.handle_webhook_event(project_id, event_type, payload, db)
    return {"status": "ok", "message": f"Processed {event_type} event for project {project_id}"}


@router.post("/{project_id}/discord/connect")
async def connect_discord_guild(
    body: DiscordConnectRequest,
    context: ProjectContext = Depends(require_project_owner),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Connect Discord server guild and configure monitored channels."""
    success = await DiscordIngestionService.connect_guild(
        context.project.project_id, body.discord_guild_id, body.discord_channels, db
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to connect Discord guild")
    return {"message": "Discord server connected and channels configured"}


@router.post("/{project_id}/discord/disconnect")
async def disconnect_discord_guild(
    context: ProjectContext = Depends(require_project_owner),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Disconnect Discord server and purge stored Discord memory."""
    success = await DiscordIngestionService.disconnect_guild(context.project.project_id, db)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to disconnect Discord")
    return {"message": "Discord disconnected and memory purged"}


@router.post("/{project_id}/discord/channels")
async def update_discord_channels(
    body: DiscordChannelsRequest,
    context: ProjectContext = Depends(require_project_owner),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update monitored Discord channels list."""
    success = await DiscordIngestionService.update_channels(
        context.project.project_id, body.discord_channels, db
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update Discord channels")
    return {"message": "Discord channels updated successfully"}
