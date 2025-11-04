import asyncio
import httpx
import os

CLEANUP_INTERVAL = 3600

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
URL_SERVICE_URL = os.getenv("URL_SERVICE_URL", "http://localhost:8001")

async def cleanup_expired_urls():
    if not ADMIN_TOKEN:
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{URL_SERVICE_URL}/admin/cleanup-expired",
                headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
                timeout=30
            )
    except Exception:
        pass

async def run_cleanup_scheduler():
    while True:
        await cleanup_expired_urls()
        await asyncio.sleep(CLEANUP_INTERVAL)

if __name__ == "__main__":
    asyncio.run(run_cleanup_scheduler())