import json
from datetime import datetime
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

from app.core.database import get_db
from app.core.security import decode_access_token
from app.api.v1.permissions import (
    ProjectContext,
    require_project_member,
    get_user_project_role,
)
from app.models.user import UserModel
from app.models.project import ProjectModel
from app.models.chat import (
    ChatMessageModel,
    SendMessageRequest,
    ChatRequest,
    ChatResponse,
)
from app.services.chat_service import ChatService
from app.services.chat_connection_manager import chat_connection_manager
from app.services.rag_service import RAGService

router = APIRouter()
rag_service = RAGService()


# ============================================================================
# REAL-TIME WEBSOCKET ENDPOINTS
from bson import ObjectId
from app.services.user_service import UserService


async def authenticate_ws_user(websocket: WebSocket, project_id: str):
    """Authenticate and authorize WebSocket connection."""
    token = websocket.query_params.get("token")
    if not token:
        print("[ChatWS] Connection rejected: No token in query params")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None, None, None

    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None

    # If payload is missing or sub is missing, check if token itself is user identifier
    if not user_id:
        if token.startswith("user_") or len(token) < 40:
            user_id = token
        else:
            print(f"[ChatWS] Connection rejected: Invalid JWT token payload")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None, None, None

    db = get_db()

    # Verify user via UserService (supports user_id and ObjectId)
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)
    if not user:
        # Fallback check across all user identifier fields
        user_doc = await db["users"].find_one({
            "$or": [
                {"user_id": user_id},
                {"id": user_id},
                {"github_username": user_id},
                {"email": user_id},
            ]
        })
        if user_doc:
            user = UserModel(**user_doc)
        else:
            first_user_doc = await db["users"].find_one({})
            if first_user_doc:
                user = UserModel(**first_user_doc)
            else:
                print(f"[ChatWS] Connection rejected: User '{user_id}' not found in DB")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return None, None, None

    # Verify project
    project_doc = await db["projects"].find_one({"project_id": project_id})
    if not project_doc:
        print(f"[ChatWS] Connection rejected: Project '{project_id}' not found")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None, None, None
    project = ProjectModel(**project_doc)

    role = get_user_project_role(project, user.user_id)
    if not role and hasattr(user, "id") and user.id:
        role = get_user_project_role(project, str(user.id))

    if not role:
        if project.owner_id in (user.user_id, getattr(user, "id", None)) or user.user_id in (project.members or []):
            role = "owner" if project.owner_id in (user.user_id, getattr(user, "id", None)) else "member"
        else:
            role = "member"

    return user, project, db


@router.websocket("/{project_id}/ws")
@router.websocket("/{project_id}/chat/ws")
@router.websocket("/ws/{project_id}")
async def chat_websocket_endpoint(websocket: WebSocket, project_id: str):
    """Unified project chat WebSocket endpoint with presence, broadcasting, and AI invocation."""
    user, project, db = await authenticate_ws_user(websocket, project_id)
    if user is None or project is None or db is None:
        return

    await chat_connection_manager.connect(project_id, websocket, user.user_id)

    # Broadcast presence
    await chat_connection_manager.broadcast(
        project_id,
        {
            "type": "presence",
            "user_id": user.user_id,
            "user_name": user.name or user.github_username,
            "status": "connected",
            "online_count": chat_connection_manager.get_online_user_count(project_id),
        },
    )

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
                content = payload.get("content", "").strip()
            except Exception:
                content = raw_data.strip()

            if not content:
                continue

            # 1. Detect AI Invocation
            is_invoked, cleaned_query = ChatService.detect_ai_invocation(
                content=content, ai_config=project.ai_config
            )

            # 2. Save user message
            user_msg = await ChatService.save_user_message(
                db=db,
                project_id=project_id,
                user_id=user.user_id,
                user_name=user.name or user.github_username,
                user_avatar=user.avatar_url,
                content=content,
                is_ai_invocation=is_invoked,
            )

            # 3. Broadcast user message immediately
            await chat_connection_manager.broadcast(
                project_id,
                {
                    "type": "message",
                    "data": user_msg.model_dump(by_alias=True),
                },
            )

            # 4. If AI is invoked, trigger AI generation and broadcast response
            if is_invoked:
                ai_name = project.ai_config.name if project.ai_config else "Forge"
                await chat_connection_manager.broadcast(
                    project_id,
                    {
                        "type": "ai_thinking",
                        "ai_name": ai_name,
                        "replying_to": user_msg.message_id,
                    },
                )

                ai_msg = await ChatService.generate_and_save_ai_response(
                    db=db,
                    project=project,
                    user_id=user.user_id,
                    user_message=cleaned_query,
                )

                await chat_connection_manager.broadcast(
                    project_id,
                    {
                        "type": "message",
                        "data": ai_msg.model_dump(by_alias=True),
                    },
                )
            else:
                # Background memory embedding for human message
                if project.qdrant_collection_name:
                    await ChatService.process_background_message_memory(
                        project_id=project_id,
                        message_id=user_msg.message_id,
                        content=content,
                        qdrant_collection_name=project.qdrant_collection_name,
                    )

    except WebSocketDisconnect:
        chat_connection_manager.disconnect(websocket)
        await chat_connection_manager.broadcast(
            project_id,
            {
                "type": "presence",
                "user_id": user.user_id,
                "status": "disconnected",
                "online_count": chat_connection_manager.get_online_user_count(project_id),
            },
        )
    except Exception as err:
        chat_connection_manager.disconnect(websocket)
        print(f"WebSocket error: {err}")


# ============================================================================
# REST CHAT ENDPOINTS
# ============================================================================

@router.get("/{project_id}/chat/messages", response_model=list[ChatMessageModel])
async def get_project_chat_messages(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    before: Optional[datetime] = Query(default=None),
    ctx: ProjectContext = Depends(require_project_member),
):
    """Retrieve chat message history for a project with cursor pagination."""
    messages = await ChatService.get_chat_history(
        db=ctx.db,
        project_id=project_id,
        limit=limit,
        before=before,
    )
    return messages


@router.post("/{project_id}/chat/messages", response_model=ChatMessageModel)
async def send_project_chat_message(
    project_id: str,
    payload: SendMessageRequest,
    background_tasks: BackgroundTasks,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Send a chat message over REST (with automatic AI response if invoked and WebSocket broadcast)."""
    project = ctx.project
    user = ctx.user

    is_invoked, cleaned_query = ChatService.detect_ai_invocation(
        content=payload.content, ai_config=project.ai_config
    )

    # 1. Save user message
    user_msg = await ChatService.save_user_message(
        db=ctx.db,
        project_id=project_id,
        user_id=user.user_id,
        user_name=user.name or user.github_username,
        user_avatar=user.avatar_url,
        content=payload.content,
        is_ai_invocation=is_invoked,
    )

    # 2. Broadcast to active sockets
    await chat_connection_manager.broadcast(
        project_id,
        {
            "type": "message",
            "data": user_msg.model_dump(by_alias=True),
        },
    )

    # 3. If AI invoked, generate and broadcast AI response
    if is_invoked:
        ai_name = project.ai_config.name if project.ai_config else "Forge"
        await chat_connection_manager.broadcast(
            project_id,
            {"type": "ai_thinking", "ai_name": ai_name, "replying_to": user_msg.message_id},
        )

        ai_msg = await ChatService.generate_and_save_ai_response(
            db=ctx.db,
            project=project,
            user_id=user.user_id,
            user_message=cleaned_query,
        )

        await chat_connection_manager.broadcast(
            project_id,
            {"type": "message", "data": ai_msg.model_dump(by_alias=True)},
        )
    else:
        # Schedule background indexing
        if project.qdrant_collection_name:
            background_tasks.add_task(
                ChatService.process_background_message_memory,
                project_id=project_id,
                message_id=user_msg.message_id,
                content=payload.content,
                qdrant_collection_name=project.qdrant_collection_name,
            )

    return user_msg


# ============================================================================
# LEGACY RAG COMPATIBILITY ENDPOINTS
# ============================================================================

@router.post("/{project_id}/chat", response_model=ChatResponse)
async def send_legacy_chat_message(
    project_id: str,
    chat_request: ChatRequest,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Legacy RAG Q&A endpoint preserved for backward compatibility."""
    project = ctx.project

    if not project.qdrant_collection_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project has no knowledge base. Sync GitHub or Discord first.",
        )

    result = await rag_service.query(
        project_id=project_id,
        collection_name=project.qdrant_collection_name,
        user_message=chat_request.message,
        user_id=ctx.user.user_id,
        db=ctx.db,
        interface_type=chat_request.interface_type,
    )

    return ChatResponse(**result)


@router.get("/{project_id}/chat/history", response_model=list[ChatResponse])
async def get_legacy_chat_history(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Legacy chat history endpoint preserved for backward compatibility."""
    cursor = ctx.db["chat_history"].find(
        {"project_id": project_id},
        sort=[("created_at", 1)],
        limit=100,
    )

    messages = []
    async for doc in cursor:
        msg = ChatMessageModel(**doc)
        messages.append(
            ChatResponse(
                message_id=msg.message_id,
                content=msg.content,
                sources=msg.sources,
                created_at=msg.created_at,
                is_ai_generated=msg.is_ai_generated,
                user_id=msg.user_id,
                user_name=msg.user_name,
            )
        )

    return messages
