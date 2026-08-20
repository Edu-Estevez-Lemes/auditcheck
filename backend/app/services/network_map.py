# ── Mapa de Red ──────────────────────────────────────────────────────────────
from __future__ import annotations
import ipaddress
from sqlalchemy.orm import Session

from ..models.device import Device, Port
from ..models.finding import Finding
from ..schemas.network_map import NetworkMapNode, NetworkMapEdge, NetworkMapOut

DEVICE_TYPE_TO_NODE_TYPE: dict[str, str] = {
    "windows_server": "windows_server",
    "windows_workstation": "workstation",
    "linux": "workstation",
    "esxi": "esxi",
    "vcenter": "esxi",
    "vmware_appliance": "esxi",
    "fortigate": "fortigate",
    "router": "fortigate",
    "switch": "switch",
    "nas": "nas",
    "printer": "printer",
    "ilo": "ilo",
    "idrac": "ilo",
    "veeam": "workstation",
}

_SEVERITY_ORDER = ["critical", "high", "medium", "low"]


def _node_type(device: Device) -> str:
    return DEVICE_TYPE_TO_NODE_TYPE.get(device.device_type, "unknown")


def _risk_level(findings: list[Finding]) -> str:
    open_findings = [f for f in findings if f.status == "open"]
    for severity in _SEVERITY_ORDER:
        if any(f.severity == severity for f in open_findings):
            return severity
    return "none"


def _subnet_key(ip_address: str | None) -> str | None:
    if not ip_address:
        return None
    try:
        network = ipaddress.ip_network(f"{ip_address}/24", strict=False)
    except ValueError:
        return None
    return str(network)


def build_network_map(db: Session, audit_id: int) -> NetworkMapOut:
    devices = db.query(Device).filter(Device.audit_id == audit_id).all()
    if not devices:
        return NetworkMapOut(nodes=[], edges=[])

    device_ids = [d.id for d in devices]
    ports = db.query(Port).filter(Port.device_id.in_(device_ids)).all()
    findings = db.query(Finding).filter(Finding.audit_id == audit_id).all()

    ports_by_device: dict[int, list[Port]] = {}
    for p in ports:
        ports_by_device.setdefault(p.device_id, []).append(p)

    findings_by_device: dict[int, list[Finding]] = {}
    for f in findings:
        if f.device_id is not None:
            findings_by_device.setdefault(f.device_id, []).append(f)

    nodes: list[NetworkMapNode] = []
    edges: list[NetworkMapEdge] = []

    devices_by_subnet: dict[str, list[Device]] = {}
    for device in devices:
        device_ports = ports_by_device.get(device.id, [])
        device_findings = findings_by_device.get(device.id, [])
        node_id = f"device-{device.id}"

        nodes.append(NetworkMapNode(
            id=node_id,
            label=device.display_name or device.hostname or device.ip_address,
            ip=device.ip_address,
            hostname=device.hostname,
            type=_node_type(device),
            risk_level=_risk_level(device_findings),
            open_ports=sorted(p.port_number for p in device_ports if p.state == "open"),
            findings_count=len(device_findings),
        ))

        subnet = _subnet_key(device.ip_address)
        if subnet:
            devices_by_subnet.setdefault(subnet, []).append(device)

    fortigate = next((d for d in devices if _node_type(d) == "fortigate"), None)
    root_id = f"device-{fortigate.id}" if fortigate else None
    root_subnet = _subnet_key(fortigate.ip_address) if fortigate else None

    for subnet, subnet_devices in devices_by_subnet.items():
        switch = next((d for d in subnet_devices if _node_type(d) == "switch"), None)
        if switch:
            hub_id = f"device-{switch.id}"
        else:
            hub_id = f"gateway_{subnet}"
            gateway_ip = str(list(ipaddress.ip_network(subnet).hosts())[0]) if list(ipaddress.ip_network(subnet).hosts()) else None
            nodes.append(NetworkMapNode(
                id=hub_id,
                label=f"Gateway {gateway_ip or subnet}",
                ip=gateway_ip,
                type="switch",
                risk_level="none",
                open_ports=[],
                findings_count=0,
            ))

        for device in subnet_devices:
            device_node_id = f"device-{device.id}"
            if device_node_id == hub_id:
                continue
            edges.append(NetworkMapEdge(source=hub_id, target=device_node_id))

        # El root (fortigate) ya queda conectado como hoja normal de su propia
        # subred en el bucle anterior; solo se enlazan al root las subredes
        # distintas a la suya, para no duplicar/contradecir esa conexión.
        if root_id and hub_id != root_id and subnet != root_subnet:
            edges.append(NetworkMapEdge(source=root_id, target=hub_id))

    return NetworkMapOut(nodes=nodes, edges=edges)
