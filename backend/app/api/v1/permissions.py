from fastapi import Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.dependencies import get_current_user
from app.models.user import UserModel
from app.models.project import ProjectModel, ProjectRole


class ProjectContext(BaseModel):
    """Context container for authorized project operations."""
    project: ProjectModel
    role: str  # "owner" | "member"
    user: UserModel
    db: AsyncIOMotorDatabase

    class Config:
        arbitrary_types_allowed = True


def get_user_project_role(project: ProjectModel, user_id: str) -> str | None:
    """Determine a user's role in a project. Returns 'owner', 'member', or None if not in project."""
    # Direct owner
    if project.owner_id == user_id:
        return ProjectRole.OWNER.value
    
    # Check explicit member_roles
    if project.member_roles and user_id in project.member_roles:
        return project.member_roles[user_id]
        
    # In members list
    if user_id in project.members:
        return ProjectRole.MEMBER.value
        
    return None


async def require_project_member(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ProjectContext:
    """Validate that the project exists and the current user is a member (or owner)."""
    doc = await db["projects"].find_one({"project_id": project_id})
    if not doc:
        # Fallback: try matching by MongoDB _id (ObjectId)
        try:
            from bson import ObjectId
            doc = await db["projects"].find_one({"_id": ObjectId(project_id)})
        except Exception:
            doc = await db["projects"].find_one({"_id": project_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    project = ProjectModel(**doc)
    role = get_user_project_role(project, current_user.user_id)

    # Fallback: also check with user's ObjectId
    if role is None and hasattr(current_user, "id") and current_user.id:
        role = get_user_project_role(project, str(current_user.id))

    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a member of this project",
        )

    return ProjectContext(project=project, role=role, user=current_user, db=db)


async def require_project_owner(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ProjectContext:
    """Validate that the project exists and the current user has the OWNER role."""
    doc = await db["projects"].find_one({"project_id": project_id})
    if not doc:
        try:
            from bson import ObjectId
            doc = await db["projects"].find_one({"_id": ObjectId(project_id)})
        except Exception:
            doc = await db["projects"].find_one({"_id": project_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    project = ProjectModel(**doc)
    role = get_user_project_role(project, current_user.user_id)

    if role is None and hasattr(current_user, "id") and current_user.id:
        role = get_user_project_role(project, str(current_user.id))

    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a member of this project",
        )

    if role != ProjectRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Owner permission required for this action",
        )

    return ProjectContext(project=project, role=role, user=current_user, db=db)
