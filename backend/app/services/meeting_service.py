from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, status

from app.models.meeting import (
    MeetingModel,
    MeetingStatus,
    MeetingParticipant,
    ParticipantRole,
    TranscriptSegmentModel,
    CreateMeetingRequest,
)
from app.models.user import UserModel
from app.services.decision_service import DecisionService
from app.services.action_item_service import ActionItemService


class MeetingService:
    """Service for managing project meetings, participants, and chronological transcripts."""

    COLLECTION_NAME = "meetings"
    TRANSCRIPTS_COLLECTION = "meeting_transcripts"

    def __init__(self):
        self.decision_service = DecisionService()
        self.action_service = ActionItemService()

    async def create_meeting(
        self,
        project_id: str,
        data: CreateMeetingRequest,
        creator: UserModel,
        db: AsyncIOMotorDatabase,
    ) -> MeetingModel:
        """Create a new project meeting."""
        meeting_id = str(ObjectId())
        channel_name = f"forge_{project_id[:8]}_{meeting_id[:8]}"

        host_participant = MeetingParticipant(
            user_id=creator.user_id,
            user_name=creator.name or creator.github_username,
            avatar_url=creator.avatar_url,
            role=ParticipantRole.HOST.value,
            joined_at=datetime.now(timezone.utc),
        )

        meeting = MeetingModel(
            id=str(ObjectId()),
            meeting_id=meeting_id,
            project_id=project_id,
            title=data.title.strip(),
            created_by=creator.user_id,
            status=MeetingStatus.SCHEDULED.value,
            channel_name=channel_name,
            participants=[host_participant],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        await db[self.COLLECTION_NAME].insert_one(meeting.model_dump(by_alias=True))
        return meeting

    async def get_project_meetings(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> list[MeetingModel]:
        """Fetch all meetings belonging to a project."""
        cursor = db[self.COLLECTION_NAME].find({"project_id": project_id}).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        return [MeetingModel(**d) for d in docs]

    async def get_meeting(
        self, meeting_id: str, db: AsyncIOMotorDatabase
    ) -> Optional[MeetingModel]:
        """Get meeting by ID."""
        doc = await db[self.COLLECTION_NAME].find_one({"$or": [{"meeting_id": meeting_id}, {"_id": meeting_id}]})
        if not doc:
            try:
                doc = await db[self.COLLECTION_NAME].find_one({"_id": ObjectId(meeting_id)})
            except Exception:
                pass
        return MeetingModel(**doc) if doc else None


    async def start_meeting(
        self, meeting_id: str, db: AsyncIOMotorDatabase
    ) -> MeetingModel:
        """Transition meeting to LIVE status."""
        meeting = await self.get_meeting(meeting_id, db)
        if not meeting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

        now = datetime.now(timezone.utc)
        await db[self.COLLECTION_NAME].update_one(
            {"meeting_id": meeting_id},
            {
                "$set": {
                    "status": MeetingStatus.LIVE.value,
                    "started_at": now,
                    "updated_at": now,
                }
            },
        )
        return await self.get_meeting(meeting_id, db)

    async def end_meeting(
        self, meeting_id: str, db: AsyncIOMotorDatabase
    ) -> MeetingModel:
        """Transition meeting to ENDED status."""
        meeting = await self.get_meeting(meeting_id, db)
        if not meeting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

        now = datetime.now(timezone.utc)
        await db[self.COLLECTION_NAME].update_one(
            {"meeting_id": meeting_id},
            {
                "$set": {
                    "status": MeetingStatus.ENDED.value,
                    "ended_at": now,
                    "updated_at": now,
                }
            },
        )
        return await self.get_meeting(meeting_id, db)

    async def join_meeting(
        self, meeting_id: str, user: UserModel, db: AsyncIOMotorDatabase
    ) -> MeetingModel:
        """Record a participant joining the meeting."""
        meeting = await self.get_meeting(meeting_id, db)
        if not meeting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

        now = datetime.now(timezone.utc)
        existing_p = next((p for p in meeting.participants if p.user_id == user.user_id), None)

        if existing_p:
            await db[self.COLLECTION_NAME].update_one(
                {"meeting_id": meeting_id, "participants.user_id": user.user_id},
                {"$set": {"participants.$.left_at": None, "updated_at": now}},
            )
        else:
            new_p = MeetingParticipant(
                user_id=user.user_id,
                user_name=user.name or user.github_username,
                avatar_url=user.avatar_url,
                role=ParticipantRole.PARTICIPANT.value,
                joined_at=now,
            )
            await db[self.COLLECTION_NAME].update_one(
                {"meeting_id": meeting_id},
                {"$push": {"participants": new_p.model_dump()}, "$set": {"updated_at": now}},
            )

        return await self.get_meeting(meeting_id, db)

    async def leave_meeting(
        self, meeting_id: str, user_id: str, db: AsyncIOMotorDatabase
    ) -> MeetingModel:
        """Record a participant leaving the meeting."""
        now = datetime.now(timezone.utc)
        await db[self.COLLECTION_NAME].update_one(
            {"meeting_id": meeting_id, "participants.user_id": user_id},
            {"$set": {"participants.$.left_at": now, "updated_at": now}},
        )
        return await self.get_meeting(meeting_id, db)

    async def add_transcript_segment(
        self,
        meeting_id: str,
        project_id: str,
        speaker_id: str,
        speaker_name: str,
        text: str,
        is_final: bool,
        db: AsyncIOMotorDatabase,
    ) -> TranscriptSegmentModel:
        """Append a chronological transcript segment and trigger intelligence extraction on final segments."""
        count = await db[self.TRANSCRIPTS_COLLECTION].count_documents({"meeting_id": meeting_id})
        segment = TranscriptSegmentModel(
            id=str(ObjectId()),
            segment_id=str(ObjectId()),
            meeting_id=meeting_id,
            project_id=project_id,
            speaker_id=speaker_id,
            speaker_name=speaker_name,
            text=text.strip(),
            is_final=is_final,
            sequence=count + 1,
            timestamp=datetime.now(timezone.utc),
        )

        if is_final:
            await db[self.TRANSCRIPTS_COLLECTION].insert_one(segment.model_dump(by_alias=True))

            # Non-blocking extraction of decisions and action items
            try:
                await self.decision_service.extract_decision_candidate(
                    project_id=project_id,
                    text=f"Meeting discussion by {speaker_name}: {text}",
                    source_type="meeting",
                    source_id=f"meeting_{meeting_id}",
                    source_url="",
                    db=db,
                )
            except Exception as dec_err:
                print(f"[MeetingService] Real-time decision check warning: {dec_err}")

            try:
                await self.action_service.extract_action_items(
                    project_id=project_id,
                    meeting_id=meeting_id,
                    text=text,
                    transcript_segment_id=segment.segment_id,
                    db=db,
                    speaker_name=speaker_name,
                )
            except Exception as act_err:
                print(f"[MeetingService] Real-time action check warning: {act_err}")


        return segment

    async def get_meeting_transcripts(
        self, meeting_id: str, db: AsyncIOMotorDatabase
    ) -> list[TranscriptSegmentModel]:
        """Fetch all finalized transcripts for a meeting in chronological order."""
        cursor = db[self.TRANSCRIPTS_COLLECTION].find({"meeting_id": meeting_id}).sort("sequence", 1)
        docs = await cursor.to_list(length=1000)
        return [TranscriptSegmentModel(**d) for d in docs]
