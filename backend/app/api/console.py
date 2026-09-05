# ── Consola de Red ───────────────────────────────────────────────────────────
"""Consola web de diagnóstico de red. Solo ejecuta comandos de la whitelist
cerrada definida en services/console_commands.py. El cliente primero llama a
POST /ws/console/session (autenticado) para obtener un session_id, y luego
abre WS /api/v1/ws/console/{session_id} para enviar comandos y recibir
streaming de la salida línea a línea."""
from __future__ import annotations
import asyncio
import json
import shlex
import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..services.auth import get_current_user
from ..models.user import User
from ..services.console_commands import COMMANDS, WHITELIST_HELP, ConsoleValidationError, ConsolePrompt

router = APIRouter(prefix="/ws", tags=["Consola de Red"])

# Registro de sesiones de consola activas {session_id: user_id}
_console_sessions: dict[str, int] = {}


class ConsoleSessionResponse(BaseModel):
    session_id: str
    ws_url: str


@router.post("/console/session", response_model=ConsoleSessionResponse)
def start_console_session(current_user: User = Depends(get_current_user)):
    session_id = str(uuid.uuid4())
    _console_sessions[session_id] = current_user.id
    return ConsoleSessionResponse(
        session_id=session_id,
        ws_url=f"/api/v1/ws/console/{session_id}",
    )


async def _read_prompt_answer(websocket: WebSocket) -> str:
    """Espera la respuesta del cliente a un ConsolePrompt (mismo WS, sin pasar
    por el parseo de comandos: es una respuesta libre, no una línea de comando)."""
    raw = await websocket.receive_text()
    try:
        data = json.loads(raw)
        return data.get("answer", "") if isinstance(data, dict) else str(data)
    except json.JSONDecodeError:
        return raw


async def _handle_command(websocket: WebSocket, raw: str, user_id: int) -> None:
    try:
        data = json.loads(raw)
        command_text = data.get("command", "") if isinstance(data, dict) else str(data)
    except json.JSONDecodeError:
        command_text = raw

    try:
        parts = shlex.split(command_text.strip())
    except ValueError:
        await websocket.send_text(json.dumps({"type": "error", "line": "Comando mal formado"}))
        return

    if not parts:
        return

    name = parts[0].lower()
    args = parts[1:]

    command = COMMANDS.get(name)
    if not command:
        await websocket.send_text(json.dumps({
            "type": "error",
            "line": f"Comando no reconocido: '{name}'. {WHITELIST_HELP}",
        }))
        return

    if not (command.min_args <= len(args) <= command.max_args):
        await websocket.send_text(json.dumps({"type": "error", "line": f"Uso: {command.usage}"}))
        return

    gen = command.handler(args, user_id)
    try:
        item = await gen.__anext__()
        while True:
            if isinstance(item, ConsolePrompt):
                await websocket.send_text(json.dumps({"type": "prompt", "line": item.text, "secret": item.secret}))
                answer = await _read_prompt_answer(websocket)
                item = await gen.asend(answer)
            else:
                await websocket.send_text(json.dumps({"type": "output", "line": item}))
                item = await gen.__anext__()
    except StopAsyncIteration:
        pass
    except ConsoleValidationError as e:
        await websocket.send_text(json.dumps({"type": "error", "line": str(e)}))
        return
    except asyncio.TimeoutError:
        await websocket.send_text(json.dumps({
            "type": "error",
            "line": "Comando cancelado: tiempo límite (15s) excedido",
        }))
        return
    except Exception as e:
        await websocket.send_text(json.dumps({"type": "error", "line": f"Error interno: {e}"}))
        return
    finally:
        await gen.aclose()

    await websocket.send_text(json.dumps({"type": "done"}))


@router.websocket("/console/{session_id}")
async def console_websocket(websocket: WebSocket, session_id: str):
    if session_id not in _console_sessions:
        await websocket.close(code=4401)
        return
    user_id = _console_sessions[session_id]

    await websocket.accept()
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue
            await _handle_command(websocket, raw, user_id)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _console_sessions.pop(session_id, None)
        try:
            await websocket.close()
        except Exception:
            pass
