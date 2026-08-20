from __future__ import annotations
from pydantic import BaseModel, Field


class VaultStatusOut(BaseModel):
    needs_setup: bool
    needs_migration: bool
    is_unlocked: bool


class VaultSetupRequest(BaseModel):
    passphrase: str = Field(..., min_length=12)
    confirm_passphrase: str = Field(..., min_length=12)


class VaultUnlockRequest(BaseModel):
    passphrase: str


class VaultChangeRequest(BaseModel):
    current_passphrase: str
    new_passphrase: str = Field(..., min_length=12)
    confirm_passphrase: str = Field(..., min_length=12)


class VaultMigrateRequest(BaseModel):
    new_passphrase: str = Field(..., min_length=12)
    confirm_passphrase: str = Field(..., min_length=12)
