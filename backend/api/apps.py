import os
import sys
import threading
from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = "api"

    def ready(self):
        # Skip during management commands like migrations/collectstatic
        skip_commands = {'makemigrations', 'migrate', 'collectstatic', 'shell', 'test', 'seed_content'}
        if any(cmd in sys.argv for cmd in skip_commands):
            return

        # During runserver with autoreloader, only run in the main child worker
        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') != 'true':
            return

        # Start a background daemon thread to index/sync any newly added media files
        def _background_sync():
            try:
                from .media_scanner import scan_and_sync_media
                scan_and_sync_media()
            except Exception:
                pass

        threading.Thread(target=_background_sync, daemon=True).start()
