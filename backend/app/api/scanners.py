"""
API de escaneo con WebSocket para progreso en tiempo real.
El cliente se conecta a /api/v1/scan/ws/{scan_id} para recibir eventos.
"""
from __future__ import annotations
import asyncio
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..services.auth import get_current_user
from ..services.audit import create_audit, save_scan_results
from ..models.user import User
from ..models.client import Client, IPRange
from ..scanners.network import NetworkScanner, ScanEvent
from ..schemas.audit import AuditCreate
from ..config import settings

router = APIRouter(prefix="/scan", tags=["Escaneo"])

# Registro de escaneos activos {scan_id: scanner}
_active_scans: dict[str, NetworkScanner] = {}
_scan_queues: dict[str, asyncio.Queue] = {}


class ScanRequest(BaseModel):
    client_id: int
    audit_name: str
    ip_ranges: list[str] = []
    use_client_ranges: bool = True
    custom_ports: list[int] | None = None
    notes: str | None = None


class ScanStartResponse(BaseModel):
    scan_id: str
    audit_id: int
    ws_url: str
    total_ips: int


@router.post("/start", response_model=ScanStartResponse)
async def start_scan(
    req: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == req.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Determinar rangos IP
    ranges = list(req.ip_ranges)
    if req.use_client_ranges:
        for rng in db.query(IPRange).filter(IPRange.client_id == req.client_id, IPRange.is_active == True).all():
            if rng.range not in ranges:
                ranges.append(rng.range)

    if not ranges:
        raise HTTPException(status_code=400, detail="No hay rangos IP definidos para este cliente")

    from ..utils.network import expand_ip_range
    total_ips = sum(len(expand_ip_range(r)) for r in ranges)

    # Crear auditoría en BD
    audit_data = AuditCreate(
        client_id=req.client_id,
        name=req.audit_name,
        notes=req.notes,
        scanned_ranges=", ".join(ranges),
    )
    audit_out = create_audit(db, audit_data, current_user.id)

    # Crear cola y scanner
    scan_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _scan_queues[scan_id] = queue

    ports = req.custom_ports or settings.SCAN_COMMON_PORTS

    async def on_event(event: ScanEvent):
        await queue.put(event.to_json())

    scanner = NetworkScanner(ranges, ports=ports, on_event=on_event)
    _active_scans[scan_id] = scanner

    # Lanzar escaneo en background
    asyncio.create_task(_run_scan(scan_id, scanner, audit_out.id))

    return ScanStartResponse(
        scan_id=scan_id,
        audit_id=audit_out.id,
        ws_url=f"/api/v1/scan/ws/{scan_id}",
        total_ips=total_ips,
    )


async def _run_scan(scan_id: str, scanner: NetworkScanner, audit_id: int):
    queue = _scan_queues.get(scan_id)
    try:
        devices = await scanner.run()

        # Guardar resultados en BD
        def _save():
            db = SessionLocal()
            try:
                save_scan_results(db, audit_id, [d.to_dict() for d in devices])
            finally:
                db.close()

        await run_in_threadpool(_save)

        if queue:
            await queue.put(json.dumps({"type": "scan_saved", "audit_id": audit_id}))
            await queue.put(None)  # Señal de fin

    except Exception as e:
        if queue:
            await queue.put(json.dumps({"type": "scan_error", "error": str(e)}))
            await queue.put(None)
    finally:
        _active_scans.pop(scan_id, None)


@router.websocket("/ws/{scan_id}")
async def scan_websocket(websocket: WebSocket, scan_id: str):
    await websocket.accept()

    queue = _scan_queues.get(scan_id)
    if not queue:
        await websocket.send_text(json.dumps({"type": "error", "error": "Escaneo no encontrado"}))
        await websocket.close()
        return

    try:
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=60.0)
                if message is None:
                    await websocket.send_text(json.dumps({"type": "done"}))
                    break
                await websocket.send_text(message)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _scan_queues.pop(scan_id, None)
        await websocket.close()


@router.post("/cancel/{scan_id}", status_code=200)
def cancel_scan(scan_id: str, _: User = Depends(get_current_user)):
    scanner = _active_scans.get(scan_id)
    if scanner:
        scanner.cancel()
        return {"message": "Escaneo cancelado"}
    raise HTTPException(status_code=404, detail="Escaneo no encontrado o ya completado")
