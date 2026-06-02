from __future__ import annotations
from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class LoginProfile(Base, TimestampMixin):
    """
    Perfil de login reutilizable por tipo de dispositivo.

    Almacena los selectores CSS necesarios para autorrellenar formularios de
    login en plataformas conocidas (FortiGate, iLO, vCenter, etc.).

    Fase 2: usado para mostrar hints en el panel de credenciales web.
    Fase 3: base para automatización con Playwright/Selenium por servicio.
    """
    __tablename__ = "login_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Identificación
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Coincide con Device.device_type: fortigate, esxi, vcenter, ilo, idrac, nas, veeam, etc.

    # Coincidencia por URL (opcional — para diferencia marca dentro del mismo device_type)
    url_pattern: Mapped[str | None] = mapped_column(String(255))
    # Regex aplicada sobre la URL. Ej: "synology" para diferenciar de QNAP en device_type=nas.

    # Selectores CSS del formulario de login
    username_selector: Mapped[str | None] = mapped_column(String(255))
    password_selector: Mapped[str | None] = mapped_column(String(255))
    submit_selector: Mapped[str | None] = mapped_column(String(255))

    # Ruta previa al formulario (por si el login está en una sub-ruta)
    pre_login_path: Mapped[str | None] = mapped_column(String(255))
    # Ej: "/ui/#/login" para vCenter, "/login" para algunos NAS

    # Script JS personalizado para flujos complejos (Fase 3)
    # Ej: hacer clic en un tab antes de que aparezca el formulario
    custom_script: Mapped[str | None] = mapped_column(Text)

    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
