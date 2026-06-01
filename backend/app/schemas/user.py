from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5)
    full_name: str = Field(..., min_length=1, max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    is_admin: bool = False


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    password: str | None = Field(None, min_length=8)
    is_active: bool | None = None
    is_admin: bool | None = None


class UserOut(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    must_change_password: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenData(BaseModel):
    username: str | None = None
    user_id: int | None = None
