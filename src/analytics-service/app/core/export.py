import json
import xlsxwriter # type: ignore

from io import BytesIO
from typing import List, Dict, Any

from app.models.analytics import ClickEvent

def export_stats_to_json(stats: Dict[str, Any]) -> str:
    return json.dumps(stats, default=str, indent=2)

def export_stats_to_xlsx(stats: Dict[str, Any]) -> bytes | str:
    buffer = BytesIO()

    wb = xlsxwriter.Workbook(buffer, {"in_memory": True})
    bold = wb.add_format({"bold": True})
    
    ws = wb.add_worksheet("Summary")
    ws.write_row(0, 0, ["metric", "value"], bold)
    ws.write_row(1, 0, ["total_clicks", stats.get("total_clicks", 0)])
    ws.write_row(2, 0, ["unique_ips",   stats.get("unique_ips",   0)])
    ws.write_row(3, 0, ["total_links",  stats.get("total_links",  0)])
    ws.set_column(0, 0, 20)

    def _dump_dict(sheet_name: str, data_key: str):
        data = stats.get(data_key)
        if not data:
            return
        
        ws_local = wb.add_worksheet(sheet_name)
        ws_local.write_row(0, 0, [data_key[:-1], "clicks"], bold)

        for row, (k, v) in enumerate(data.items(), start=1):
            ws_local.write_row(row, 0, [k, v])

        ws_local.set_column(0, 0, 20)

    _dump_dict("Countries", "countries")
    _dump_dict("Devices",   "devices")
    _dump_dict("Browsers",  "browsers")

    wb.close()
    buffer.seek(0)

    return buffer.getvalue()

def export_clicks_to_json(events: List[ClickEvent]) -> str:
    data = [
        {
            "id": event.id,
            "url_id": event.url_id,
            "ip_address": event.ip_address,
            "user_agent": event.user_agent,
            "referer": event.referer,
            "country": event.country,
            "city": event.city,
            "device_type": event.device_type,
            "browser": event.browser,
            "os": event.os,
            "clicked_at": event.clicked_at.isoformat()
        }
        for event in events
    ]

    return json.dumps(data, default=str, indent=2)

def export_clicks_to_xlsx(events: List[ClickEvent]) -> str:
    buffer = BytesIO()

    wb = xlsxwriter.Workbook(buffer, {"in_memory": True})
    bold = wb.add_format({"bold": True})

    cols = [
        "id", "url_id", "ip_address", "user_agent", "referer",
        "country", "city", "device_type", "browser", "os", "clicked_at"
    ]

    ws = wb.add_worksheet("Clicks")
    ws.write_row(0, 0, cols, bold)

    for row, ev in enumerate(events, start=1):
        ws.write_row(row, 0, [
            getattr(ev, "id", None),
            getattr(ev, "url_id", None),
            getattr(ev, "ip_address", None),
            getattr(ev, "user_agent", None),
            getattr(ev, "referer", None),
            getattr(ev, "country", None),
            getattr(ev, "city", None),
            getattr(ev, "device_type", None),
            getattr(ev, "browser", None),
            getattr(ev, "os", None),
            getattr(ev, "clicked_at", None).isoformat()
            if getattr(ev, "clicked_at", None) else None
        ])

    ws.set_column(0, len(cols) - 1, 18)
    wb.close()
    buffer.seek(0)
    
    return buffer.getvalue()