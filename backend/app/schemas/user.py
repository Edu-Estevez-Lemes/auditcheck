from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field

# Bloque 1 — Usuarios y roles
ROLE_VALUES = ("superadmin", "admin", "tecnico")


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5)
    full_name: str = Field(..., min_length=1, max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role: str = Field(default="tecnico")


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    password: str | None = Field(None, min_length=8)
    is_active: bool | None = None


class UserOut(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    role: str
    must_change_password: bool
    last_login: datetime | None = None
    created_at: datetime
    updated_at: datetime
    avatar: str | None = None

    model_config = {"from_attributes": True}


class AvatarPresetRequest(BaseModel):
    preset: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenData(BaseModel):
    username: str | None = None
    user_id: int | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class RoleUpdateRequest(BaseModel):
    role: str


class ResetPasswordOut(BaseModel):
    temporary_password: str


class BootstrapRequest(BaseModel):
    email: str = Field(..., min_length=5)
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)
