from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel

from app.core.database import get_qdrant
from app.api.v1.permissions import ProjectContext, require_project_member
from app.services.embedding_service import EmbeddingService
from app.services.qdrant_service import QdrantService
from app.core.config import settings

router = APIRouter()


class GroupChatMessageCreate(BaseModel):
    content: str


async def process_group_chat_message(project_id: str, message_id: str, content: str, qdrant_collection_name: str):
    """Background task to check relevance and embed."""
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Does this message contain important project context, design decisions, configurations, tasks, or API designs? Respond exactly 'yes' or 'no'."},
                {"role": "user", "content": content}
            ],
            temperature=0,
            max_tokens=10
        )
        is_relevant = response.choices[0].message.content.strip().lower() == "yes"
        
        if is_relevant:
            embedding_service = EmbeddingService()
            qdrant = get_qdrant()
            qdrant_service = QdrantService(qdrant)
            
            metadata = {
                "project_id": project_id,
                "message_id": message_id,
            }
            
            points = await embedding_service.chunk_and_embed(
                text=content,
                source_type="group_chat_message",
                source_id=message_id,
                metadata=metadata
            )
            
            if points:
                await qdrant_service.upsert_points(qdrant_collection_name, points)
    except Exception as e:
        print(f"Failed to process group chat message: {e}")


@router.post("/{project_id}/group-chat")
async def send_group_message(
    project_id: str,
    data: GroupChatMessageCreate,
    background_tasks: BackgroundTasks,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Send a group chat message."""
    project = ctx.project
    
    message_id = str(ObjectId())
    message = {
        "_id": message_id,
        "project_id": project_id,
        "user_id": ctx.user.user_id,
        "user_name": ctx.user.github_username,
        "content": data.content,
        "created_at": datetime.now(timezone.utc)
    }
    
    await ctx.db["group_chat_history"].insert_one(message)
    
    background_tasks.add_task(
        process_group_chat_message,
        project_id=project_id,
        message_id=message_id,
        content=data.content,
        qdrant_collection_name=project.qdrant_collection_name
    )
    
    message["id"] = message.pop("_id")
    ca = message.get("created_at")
    if isinstance(ca, datetime):
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        message["created_at"] = ca.isoformat()
    return message


@router.get("/{project_id}/group-chat")
async def get_group_chat_history(
    project_id: str,
    ctx: ProjectContext = Depends(require_project_member),
):
    """Get group chat message history."""
    project = ctx.project
    user_cursor = ctx.db["users"].find({"user_id": {"$in": project.members}})
    users_list = await user_cursor.to_list(length=len(project.members))
    user_map = {u["user_id"]: u.get("github_username", "") for u in users_list}

    cursor = ctx.db["group_chat_history"].find({"project_id": project_id}).sort("created_at", 1)
    messages = []
    async for msg in cursor:
        msg["id"] = msg.pop("_id")
        msg["user_name"] = user_map.get(msg["user_id"], msg.get("user_name", msg["user_id"]))
        ca = msg.get("created_at")
        if isinstance(ca, datetime):
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            msg["created_at"] = ca.isoformat()
        elif isinstance(ca, str) and not ca.endswith("Z") and not ("+" in ca[-6:] or "-" in ca[-6:]):
            msg["created_at"] = ca + "Z"
        messages.append(msg)
        
    return messages
