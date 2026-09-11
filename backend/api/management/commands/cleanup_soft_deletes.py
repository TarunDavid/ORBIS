"""
Management command to purge expired soft-deleted content assets.
Usage: python manage.py cleanup_soft_deletes
"""
from django.core.management.base import BaseCommand
from api.content_pipeline import cleanup_expired_soft_deletes


class Command(BaseCommand):
    help = 'Purge soft-deleted content assets past the retention window'

    def handle(self, *args, **options):
        self.stdout.write("Checking for expired soft-deleted assets...")
        result = cleanup_expired_soft_deletes()
        purged = result['purged']
        if purged > 0:
            self.stdout.write(self.style.SUCCESS(f"✅ Purged {purged} expired asset(s)."))
        else:
            self.stdout.write(self.style.SUCCESS("No expired assets to purge."))
