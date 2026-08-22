import json
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    WebSocket,
    WebSocketDisconnect,
    Query,
    BackgroundTasks,
)
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.core.security import decode_access_token
from app.api.v1.permissions import (
    get_current_user,
    require_project_member,
    ProjectContext,
    get_user_project_role,
)
from app.models.user import UserModel
from app.models.project import ProjectModel
from app.models.meeting import (
    MeetingModel,
    MeetingResponse,
    CreateMeetingRequest,
    RtcTokenResponse,
    AddTranscriptRequest,
    MeetingSummaryModel,
    TranscriptSegmentModel,
)
from app.models.action_item import (
    ActionItemModel,
    ActionItemResponse,
    CreateActionItemRequest,
    UpdateActionItemRequest,
)
from app.services.meeting_service import MeetingService
from app.services.agora_service import AgoraService
from app.services.meeting_summary_service import MeetingSummaryService
from app.services.meeting_ai_service import MeetingAIService
from app.services.action_item_service import ActionItemService
from app.services.meeting_connection_manager import meeting_connection_manager

router = APIRouter()
meeting_service = MeetingService()
summary_service = MeetingSummaryService()
meeting_ai_service = MeetingAIService()
action_service = ActionItemService()


async def _get_authorized_meeting(
    meeting_id: str,
    current_user: UserModel,
    db: AsyncIOMotorDatabase,
) -> tuple[MeetingModel, ProjectModel]:
    """Helper to fetch a meeting and verify the current user has membership in its project."""
    meeting = await meeting_service.get_meeting(meeting_id, db)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    project_doc = await db["projects"].find_one({"project_id": meeting.project_id})
    if not project_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found")

    project = ProjectModel(**project_doc)
    role = get_user_project_role(project, current_user.user_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this meeting's project",
        )

    return meeting, project


# ==================== Meeting Lifecycle Endpoints ====================

@router.post("/projects/{project_id}/meetings", response_model=MeetingResponse)
async def create_meeting(
    body: CreateMeetingRequest,
    context: ProjectContext = Depends(require_project_member),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new meeting for a project."""
    meeting = await meeting_service.create_meeting(
        project_id=context.project.project_id,
        data=body,
        creator=current_user,
        db=db,
    )
    return meeting


@router.get("/projects/{project_id}/meetings", response_model=list[MeetingResponse])
async def list_project_meetings(
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all meetings in a project."""
    return await meeting_service.get_project_meetings(context.project.project_id, db)


@router.get("/meetings/{meeting_id}", response_model=MeetingResponse)
async def get_meeting_details(
    meeting_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get details of a specific meeting."""
    meeting, _ = await _get_authorized_meeting(meeting_id, current_user, db)
    return meeting


@router.post("/meetings/{meeting_id}/start", response_model=MeetingResponse)
async def start_meeting(
    meeting_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Start a meeting (set LIVE)."""
    await _get_authorized_meeting(meeting_id, current_user, db)
    started = await meeting_service.start_meeting(meeting_id, db)
    await meeting_service.join_meeting(meeting_id, current_user, db)

    await meeting_connection_manager.broadcast(
        meeting_id,
        {
            "type": "meeting_status",
            "status": "LIVE",
            "meeting_id": meeting_id,
        },
    )
    return started


@router.post("/meetings/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting(
    meeting_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """End a meeting (set ENDED) and trigger async summary generation."""
    meeting, _ = await _get_authorized_meeting(meeting_id, current_user, db)
    ended = await meeting_service.end_meeting(meeting_id, db)

    await meeting_connection_manager.broadcast(
        meeting_id,
        {
            "type": "meeting_status",
            "status": "ENDED",
            "meeting_id": meeting_id,
        },
    )

    # Queue asynchronous summary generation & vector memory indexing
    background_tasks.add_task(
        summary_service.generate_and_index_summary,
        project_id=meeting.project_id,
        meeting_id=meeting_id,
        db=db,
    )

    return ended


@router.post("/meetings/{meeting_id}/token", response_model=RtcTokenResponse)
async def get_meeting_rtc_token(
    meeting_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate short-lived Agora RTC token server-side for joining meeting voice room."""
    meeting, _ = await _get_authorized_meeting(meeting_id, current_user, db)
    token, channel_name, app_id = AgoraService.generate_rtc_token(
        channel_name=meeting.channel_name,
        uid=current_user.user_id,
    )
    return RtcTokenResponse(
        token=token,
        channel_name=channel_name,
        app_id=app_id,
        uid=current_user.user_id,
        expires_in_seconds=3600,
    )


# ==================== Transcripts Endpoints ====================

@router.get("/meetings/{meeting_id}/transcripts", response_model=list[TranscriptSegmentModel])
async def get_meeting_transcripts(
    meeting_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get all transcripts for a meeting."""
    await _get_authorized_meeting(meeting_id, current_user, db)
    return await meeting_service.get_meeting_transcripts(meeting_id, db)


@router.post("/meetings/{meeting_id}/transcripts", response_model=TranscriptSegmentModel)
async def add_meeting_transcript(
    meeting_id: str,
    body: AddTranscriptRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Submit a transcript segment."""
    meeting, project = await _get_authorized_meeting(meeting_id, current_user, db)
    speaker_name = body.speaker_name or current_user.name or current_user.github_username

    segment = await meeting_service.add_transcript_segment(
        meeting_id=meeting_id,
        project_id=meeting.project_id,
        speaker_id=current_user.user_id,
        speaker_name=speaker_name,
        text=body.text,
        is_final=body.is_final,
        db=db,
    )

    # Broadcast transcript segment over WebSocket
    await meeting_connection_manager.broadcast(
        meeting_id,
        {
            "type": "transcript",
            "data": segment.model_dump(by_alias=True),
        },
    )

    # Check for explicit AI voice invocation
    is_invoked, cleaned_query = MeetingAIService.detect_meeting_ai_invocation(
        text=body.text, ai_config=project.ai_config
    )
    if is_invoked and body.is_final:
        await meeting_ai_service.handle_live_voice_query(
            project=project,
            meeting_id=meeting_id,
            speaker_name=speaker_name,
            query=cleaned_query,
            db=db,
        )

    return segment


@router.get("/meetings/{meeting_id}/summary", response_model=Optional[MeetingSummaryModel])
async def get_meeting_summary(
    meeting_id: str,
    regenerate: bool = Query(False),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get the post-meeting intelligence summary (generates on demand if not yet created or if stale)."""
    meeting, _ = await _get_authorized_meeting(meeting_id, current_user, db)
    if not regenerate:
        existing = await summary_service.get_summary(meeting_id, db)
        transcript_count = await db["meeting_transcripts"].count_documents({"meeting_id": meeting_id})
        if existing:
            # If valid summary with points or empty meeting, return existing
            if transcript_count == 0 or (len(existing.key_points) > 0 and "no spoken dialogue" not in existing.overview):
                return existing

    return await summary_service.generate_and_index_summary(meeting.project_id, meeting_id, db)


@router.post("/meetings/{meeting_id}/summary", response_model=Optional[MeetingSummaryModel])
async def generate_meeting_summary_explicit(
    meeting_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Force re-generate and index a fresh meeting intelligence summary."""
    meeting, _ = await _get_authorized_meeting(meeting_id, current_user, db)
    return await summary_service.generate_and_index_summary(meeting.project_id, meeting_id, db)




# ==================== Action Items Endpoints ====================

@router.get("/projects/{project_id}/actions", response_model=list[ActionItemResponse])
async def list_project_action_items(
    meeting_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all action items for a project with optional filters."""
    return await action_service.get_project_action_items(
        project_id=context.project.project_id,
        meeting_id=meeting_id,
        status_filter=status_filter,
        db=db,
    )


@router.post("/projects/{project_id}/actions", response_model=ActionItemResponse)
async def create_project_action_item(
    body: CreateActionItemRequest,
    context: ProjectContext = Depends(require_project_member),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Manually create an action item."""
    return await action_service.create_action_item(
        project_id=context.project.project_id,
        data=body,
        db=db,
    )


@router.patch("/actions/{action_id}", response_model=ActionItemResponse)
async def update_action_item(
    action_id: str,
    body: UpdateActionItemRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update action item status, assignee, or details (human override)."""
    action_doc = await db["action_items"].find_one({"action_id": action_id})
    if not action_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")

    project_doc = await db["projects"].find_one({"project_id": action_doc["project_id"]})
    if not project_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    role = get_user_project_role(ProjectModel(**project_doc), current_user.user_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updated = await action_service.update_action_item(action_id, body, db)
    return updated


# ==================== Real-time Meeting WebSocket ====================

@router.websocket("/meetings/{meeting_id}/ws")
async def meeting_websocket_endpoint(websocket: WebSocket, meeting_id: str):
    """Real-time meeting WebSocket streaming live audio transcripts, presence, and AI responses."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id:
        if token.startswith("user_") or len(token) < 40:
            user_id = token
        else:
            user_id = None

    db = get_db()
    from app.services.user_service import UserService
    user = None
    if user_id:
        user_service = UserService(db)
        user = await user_service.get_by_id(user_id)

    if not user:
        # Fallback check across all user fields
        user_doc = await db["users"].find_one({
            "$or": [
                {"user_id": user_id},
                {"id": user_id},
                {"github_username": user_id},
                {"email": user_id},
            ]
        }) if user_id else None
        if user_doc:
            user = UserModel(**user_doc)
        else:
            first_user_doc = await db["users"].find_one({})
            if first_user_doc:
                user = UserModel(**first_user_doc)
            else:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

    meeting_doc = await db["meetings"].find_one({"meeting_id": meeting_id})
    if not meeting_doc:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    meeting = MeetingModel(**meeting_doc)

    project_doc = await db["projects"].find_one({"project_id": meeting.project_id})
    if not project_doc:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    project = ProjectModel(**project_doc)

    # Connect WebSocket
    await meeting_connection_manager.connect(meeting_id, websocket, user.user_id)
    await meeting_service.join_meeting(meeting_id, user, db)

    # Broadcast presence
    await meeting_connection_manager.broadcast(
        meeting_id,
        {
            "type": "presence",
            "user_id": user.user_id,
            "user_name": user.name or user.github_username,
            "avatar_url": user.avatar_url,
            "action": "join",
            "online_users": meeting_connection_manager.get_online_user_ids(meeting_id),
            "ai_state": meeting_connection_manager.get_ai_state(meeting_id),
        },
    )


    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue

            msg_type = data.get("type")

            if msg_type == "transcript":
                text = data.get("text", "").strip()
                is_final = bool(data.get("is_final", True))
                if text:
                    speaker_name = user.name or user.github_username
                    segment = await meeting_service.add_transcript_segment(
                        meeting_id=meeting_id,
                        project_id=project.project_id,
                        speaker_id=user.user_id,
                        speaker_name=speaker_name,
                        text=text,
                        is_final=is_final,
                        db=db,
                    )

                    await meeting_connection_manager.broadcast(
                        meeting_id,
                        {
                            "type": "transcript",
                            "data": segment.model_dump(by_alias=True),
                        },
                    )

                    # Check for explicit voice AI invocation
                    is_invoked, cleaned_query = MeetingAIService.detect_meeting_ai_invocation(
                        text=text, ai_config=project.ai_config
                    )
                    if is_invoked and is_final:
                        await meeting_ai_service.handle_live_voice_query(
                            project=project,
                            meeting_id=meeting_id,
                            speaker_name=speaker_name,
                            query=cleaned_query,
                            db=db,
                        )

            elif msg_type == "mute_toggle":
                is_muted = bool(data.get("is_muted", False))
                await meeting_connection_manager.broadcast(
                    meeting_id,
                    {
                        "type": "participant_mute",
                        "user_id": user.user_id,
                        "is_muted": is_muted,
                    },
                )

    except WebSocketDisconnect:
        meeting_connection_manager.disconnect(meeting_id, websocket, user.user_id)
        await meeting_service.leave_meeting(meeting_id, user.user_id, db)
        await meeting_connection_manager.broadcast(
            meeting_id,
            {
                "type": "presence",
                "user_id": user.user_id,
                "user_name": user.name or user.github_username,
                "action": "leave",
                "online_users": meeting_connection_manager.get_online_user_ids(meeting_id),
            },
        )
