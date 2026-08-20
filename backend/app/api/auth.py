from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.user import (
    Token, UserOut, UserCreate, UserUpdate,
    ChangePasswordRequest, RoleUpdateRequest, ResetPasswordOut, BootstrapRequest,
)
from ..services.auth import (
    authenticate_user, create_access_token, get_current_user, hash_password,
    verify_password, get_admin_user, require_role, generate_temp_password,
)
from ..services.audit_log import log_action
from ..models.user import User, ROLES

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.get("/bootstrap-status")
def bootstrap_status(db: Session = Depends(get_db)):
    """Público: indica si hay que mostrar la pantalla de creación del primer superadmin."""
    return {"has_users": db.query(User).count() > 0}


@router.post("/bootstrap", response_model=Token, status_code=201)
def bootstrap(request: Request, data: BootstrapRequest, db: Session = Depends(get_db)):
    """Público, pero solo funciona si no existe ningún usuario todavía."""
    if db.query(User).count() > 0:
        raise HTTPException(status_code=403, detail="El sistema ya tiene usuarios configurados")

    username = data.email.split("@")[0]
    base_username = username
    i = 1
    while db.query(User).filter(User.username == username).first():
        i += 1
        username = f"{base_username}{i}"

    user = User(
        username=username,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        is_active=True,
        is_admin=True,
        role="superadmin",
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.username, "user_id": user.id})
    log_action(db, user, "bootstrap_superadmin", target_type="user", target_id=user.id, request=request)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form.username, form.password)
    if not user:
        log_action(db, None, "login_failed", target_type="user", details={"username": form.username}, request=request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado")
    token = create_access_token({"sub": user.username, "user_id": user.id})
    log_action(db, user, "login", target_type="user", target_id=user.id, request=request)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log_action(db, current_user, "logout", target_type="user", target_id=current_user.id, request=request)
    return {"message": "Sesión cerrada"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(data: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.email:
        current_user.email = data.email
    if data.full_name:
        current_user.full_name = data.full_name
    if data.password:
        current_user.hashed_password = hash_password(data.password)
        current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(
    request: Request,
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    db.commit()
    log_action(db, current_user, "change_password", target_type="user", target_id=current_user.id, request=request)
    return {"message": "Contraseña actualizada"}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    return db.query(User).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    request: Request,
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    if data.role == "superadmin":
        raise HTTPException(status_code=403, detail="El rol superadmin no puede asignarse en la creación")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        is_admin=(data.role == "admin"),
        created_by=current_user.id,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_action(db, current_user, "create_user", target_type="user", target_id=user.id,
               details={"username": user.username, "role": user.role}, request=request)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    request: Request,
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Un admin no puede modificar a un superadmin")
    if data.is_active is False and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    if data.is_active is False and user.role == "superadmin":
        _ensure_not_last_active_superadmin(db, exclude_user_id=user.id)

    if data.email:
        user.email = data.email
    if data.full_name:
        user.full_name = data.full_name
    if data.password:
        user.hashed_password = hash_password(data.password)
    if data.is_active is not None:
        user.is_active = data.is_active

    db.commit()
    db.refresh(user)
    log_action(db, current_user, "update_user", target_type="user", target_id=user.id, request=request)
    return user


def _ensure_not_last_active_superadmin(db: Session, exclude_user_id: int) -> None:
    remaining = db.query(User).filter(
        User.role == "superadmin", User.is_active == True, User.id != exclude_user_id  # noqa: E712
    ).count()
    if remaining == 0:
        raise HTTPException(status_code=400, detail="No puede quedar el sistema sin superadmin activo")


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role == "superadmin":
        if current_user.role != "superadmin":
            raise HTTPException(status_code=403, detail="Un admin no puede eliminar a un superadmin")
        _ensure_not_last_active_superadmin(db, exclude_user_id=user.id)

    db.delete(user)
    db.commit()
    log_action(db, current_user, "delete_user", target_type="user", target_id=user_id,
               details={"username": user.username}, request=request)


@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    request: Request,
    user_id: int,
    data: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("superadmin")),
):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id and data.role != "superadmin":
        _ensure_not_last_active_superadmin(db, exclude_user_id=user.id)
    elif user.role == "superadmin" and data.role != "superadmin":
        _ensure_not_last_active_superadmin(db, exclude_user_id=user.id)

    old_role = user.role
    user.role = data.role
    user.is_admin = (data.role in ("admin", "superadmin"))
    db.commit()
    db.refresh(user)
    log_action(db, current_user, "change_role", target_type="user", target_id=user.id,
               details={"from": old_role, "to": data.role}, request=request)
    return user


@router.put("/users/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Un admin no puede resetear la contraseña de un superadmin")

    temp_password = generate_temp_password()
    user.hashed_password = hash_password(temp_password)
    user.must_change_password = True
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    log_action(db, current_user, "reset_password", target_type="user", target_id=user.id, request=request)
    return ResetPasswordOut(temporary_password=temp_password)
