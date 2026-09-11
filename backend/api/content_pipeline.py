"""
ORBIS Content Pipeline
======================
Explicit, testable pipeline for: upload → hash → manifest → sync-ready.
Each function is idempotent — re-running on the same file version won't
duplicate chunks or corrupt the manifest.
"""
import os
import hashlib
import logging
import threading
from datetime import timedelta
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def compute_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file on disk."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def scan_file_for_threats(file_path: str) -> bool:
    """
    Stub for virus/malware scanning.
    Returns True if the file is clean, False if infected.
    Plug in ClamAV or similar here in production.
    """
    # TODO: Integrate with ClamAV or another offline scanner
    return True


def get_content_type_from_extension(filename: str) -> str | None:
    """Map a file extension to a content type."""
    ext = os.path.splitext(filename)[1].lower()
    from .media_scanner import VIDEO_EXTS, NOTES_EXTS, PPT_EXTS
    if ext in VIDEO_EXTS:
        return 'video'
    elif ext in PPT_EXTS:
        return 'ppt'
    elif ext in NOTES_EXTS:
        if 'textbook' in filename.lower():
            return 'textbook'
        return 'notes'
    return None


def validate_upload(filename: str, content_type: str, file_size: int) -> tuple[bool, str]:
    """
    Validate a file upload against allowed extensions and size limits.
    Returns (is_valid, error_message).
    """
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = settings.ORBIS_ALLOWED_EXTENSIONS.get(content_type, [])
    if ext not in allowed_exts:
        return False, f"File extension '{ext}' is not allowed for content type '{content_type}'. Allowed: {', '.join(allowed_exts)}"

    max_size_mb = settings.ORBIS_MAX_UPLOAD_SIZE_MB.get(content_type, 50)
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        return False, f"File size ({file_size / (1024*1024):.1f} MB) exceeds the {max_size_mb} MB limit for '{content_type}'"

    return True, ''


def build_media_path(grade_identifier: str, subject_identifier: str, chapter_order: int, filename: str) -> str:
    """Build the relative media path for a content file (relative to MEDIA_ROOT)."""
    grade_folder = grade_identifier.lower().replace(' ', '')
    subject_folder = subject_identifier.lower()
    chapter_folder = f"ch{chapter_order}"
    return os.path.join(grade_folder, subject_folder, chapter_folder, filename)


def process_upload(uploaded_file, subject_id: int, chapter_id: int, content_type: str, teacher_user) -> dict:
    """
    Full upload pipeline:
    [1] Validate file
    [2] Save file to media directory
    [3] Compute SHA-256 hash (background thread for large files)
    [4] Create ContentAsset record
    [5] Create/update ChapterResource record
    [6] Log activity
    [7] Bump manifest version
    """
    from .models import Subject, Chapter, ChapterResource, ContentAsset, TeacherActivityLog

    # Resolve subject and chapter
    subject = Subject.objects.get(pk=subject_id)
    chapter = Chapter.objects.get(pk=chapter_id)
    grade = subject.grade

    filename = uploaded_file.name
    file_size = uploaded_file.size

    # [1] Validate
    is_valid, error_msg = validate_upload(filename, content_type, file_size)
    if not is_valid:
        return {'success': False, 'error': error_msg}

    # [2] Save file to media directory
    rel_path = build_media_path(grade.identifier, subject.identifier, chapter.order, filename)
    abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)

    os.makedirs(os.path.dirname(abs_path), exist_ok=True)

    # Stream to disk (don't load entire file in memory)
    with open(abs_path, 'wb') as dest:
        for chunk in uploaded_file.chunks():
            dest.write(chunk)

    # [3] Compute SHA-256
    file_hash = compute_file_hash(abs_path)

    # Scan for threats (stub)
    if not scan_file_for_threats(abs_path):
        os.remove(abs_path)
        return {'success': False, 'error': 'File failed security scan'}

    # [4] Create ChapterResource record
    file_url = f"/media/{rel_path.replace(os.sep, '/')}"
    resource, _ = ChapterResource.objects.get_or_create(
        chapter=chapter,
        resource_type=content_type,
        file_path=file_url,
    )

    # Check for existing asset with same file path (idempotency)
    existing_asset = ContentAsset.objects.filter(
        file_path=rel_path, status='active'
    ).first()

    if existing_asset:
        # Re-upload of same file — bump version
        existing_asset.version += 1
        existing_asset.sha256 = file_hash
        existing_asset.size_bytes = file_size
        existing_asset.uploaded_by = teacher_user
        existing_asset.save(update_fields=['version', 'sha256', 'size_bytes', 'uploaded_by'])
        asset = existing_asset
    else:
        # [4] Create ContentAsset record
        asset = ContentAsset.objects.create(
            subject=subject,
            chapter=chapter,
            content_type=content_type,
            filename=filename,
            file_path=rel_path,
            size_bytes=file_size,
            sha256=file_hash,
            version=1,
            uploaded_by=teacher_user,
            status='active',
            chapter_resource=resource,
        )

    # [6] Log activity
    TeacherActivityLog.objects.create(
        teacher=teacher_user,
        action='upload',
        content_asset=asset,
        asset_filename=filename,
        subject_name=subject.display_name,
        chapter_title=chapter.title,
    )

    # [7] Bump manifest version (in background thread)
    threading.Thread(target=_bump_manifest_version, args=(f"Upload: {filename}",), daemon=True).start()

    return {
        'success': True,
        'asset_id': asset.id,
        'filename': filename,
        'file_path': rel_path,
        'sha256': file_hash,
        'size_bytes': file_size,
    }


def process_deletion(content_asset_id: int, mode: str = 'soft', reason: str = '', teacher_user=None) -> dict:
    """
    Delete pipeline:
    - soft: Mark as soft_deleted, hide from sync manifest (tombstone), keep file on disk
    - hard: Purge file from disk, remove ChapterResource, tombstone in manifest
    """
    from .models import ContentAsset, TeacherActivityLog

    try:
        asset = ContentAsset.objects.get(pk=content_asset_id)
    except ContentAsset.DoesNotExist:
        return {'success': False, 'error': 'Content asset not found'}

    if mode == 'soft':
        asset.status = 'soft_deleted'
        asset.deleted_at = timezone.now()
        asset.deletion_reason = reason
        asset.save(update_fields=['status', 'deleted_at', 'deletion_reason'])

        # Hide the ChapterResource from student views
        if asset.chapter_resource:
            asset.chapter_resource.delete()
            asset.chapter_resource = None
            asset.save(update_fields=['chapter_resource'])

        action = 'remove'

    elif mode == 'hard':
        asset.status = 'purged'
        asset.deleted_at = timezone.now()
        asset.deletion_reason = reason
        asset.save(update_fields=['status', 'deleted_at', 'deletion_reason'])

        # Remove ChapterResource
        if asset.chapter_resource:
            asset.chapter_resource.delete()
            asset.chapter_resource = None
            asset.save(update_fields=['chapter_resource'])

        # Purge file from disk
        abs_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
        if os.path.exists(abs_path):
            os.remove(abs_path)
            logger.info(f"Purged file from disk: {abs_path}")

        action = 'hard_delete'
    else:
        return {'success': False, 'error': f"Invalid mode: {mode}. Use 'soft' or 'hard'."}

    # Log activity
    TeacherActivityLog.objects.create(
        teacher=teacher_user,
        action=action,
        content_asset=asset,
        asset_filename=asset.filename,
        subject_name=asset.subject.display_name,
        chapter_title=asset.chapter.title,
        notes=reason,
    )

    # Bump manifest version
    threading.Thread(target=_bump_manifest_version, args=(f"Delete ({mode}): {asset.filename}",), daemon=True).start()

    return {'success': True, 'mode': mode, 'asset_id': asset.id}


def process_restore(content_asset_id: int, teacher_user=None) -> dict:
    """
    Restore a soft-deleted asset within the retention window.
    Re-creates the ChapterResource so it becomes visible to students again.
    """
    from .models import ContentAsset, ChapterResource, TeacherActivityLog

    try:
        asset = ContentAsset.objects.get(pk=content_asset_id)
    except ContentAsset.DoesNotExist:
        return {'success': False, 'error': 'Content asset not found'}

    if asset.status != 'soft_deleted':
        return {'success': False, 'error': f"Cannot restore asset with status '{asset.status}'. Only soft-deleted assets can be restored."}

    # Check retention window
    retention_days = getattr(settings, 'ORBIS_SOFT_DELETE_RETENTION_DAYS', 7)
    if asset.deleted_at and (timezone.now() - asset.deleted_at) > timedelta(days=retention_days):
        return {'success': False, 'error': f"Retention window ({retention_days} days) has expired. This asset can no longer be restored."}

    # Verify file still exists on disk
    abs_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
    if not os.path.exists(abs_path):
        return {'success': False, 'error': 'File no longer exists on disk. Cannot restore.'}

    # Re-create ChapterResource
    file_url = f"/media/{asset.file_path.replace(os.sep, '/')}"
    resource, _ = ChapterResource.objects.get_or_create(
        chapter=asset.chapter,
        resource_type=asset.content_type,
        file_path=file_url,
    )
    asset.chapter_resource = resource
    asset.status = 'active'
    asset.deleted_at = None
    asset.deletion_reason = ''
    asset.save(update_fields=['chapter_resource', 'status', 'deleted_at', 'deletion_reason'])

    # Log activity
    TeacherActivityLog.objects.create(
        teacher=teacher_user,
        action='restore',
        content_asset=asset,
        asset_filename=asset.filename,
        subject_name=asset.subject.display_name,
        chapter_title=asset.chapter.title,
    )

    # Bump manifest version
    threading.Thread(target=_bump_manifest_version, args=(f"Restore: {asset.filename}",), daemon=True).start()

    return {'success': True, 'asset_id': asset.id}


def regenerate_manifest() -> dict:
    """
    Build a full manifest of all content with tombstones for deleted items.
    Returns the manifest dict and bumps the version.
    """
    from .models import ContentAsset, SyncManifestVersion

    entries = []

    # Active assets
    for asset in ContentAsset.objects.filter(status='active'):
        entries.append({
            'type': 'active',
            'file_path': f"/media/{asset.file_path.replace(os.sep, '/')}",
            'sha256': asset.sha256,
            'size_bytes': asset.size_bytes,
            'content_type': asset.content_type,
            'filename': asset.filename,
            'version': asset.version,
            'uploaded_at': asset.uploaded_at.isoformat() if asset.uploaded_at else None,
        })

    # Tombstones (soft-deleted and purged)
    for asset in ContentAsset.objects.filter(status__in=['soft_deleted', 'purged']):
        entries.append({
            'type': 'deleted',
            'file_path': f"/media/{asset.file_path.replace(os.sep, '/')}",
            'last_known_sha256': asset.sha256,
            'deleted_at': asset.deleted_at.isoformat() if asset.deleted_at else None,
        })

    # Compute manifest checksum
    import json
    manifest_json = json.dumps(entries, sort_keys=True)
    manifest_checksum = hashlib.sha256(manifest_json.encode()).hexdigest()

    # Get or create version
    latest = SyncManifestVersion.objects.first()
    new_version = (latest.version_number + 1) if latest else 1

    SyncManifestVersion.objects.create(
        version_number=new_version,
        manifest_checksum=manifest_checksum,
    )

    return {
        'version': new_version,
        'checksum': manifest_checksum,
        'entries': entries,
        'entry_count': len(entries),
    }


def _bump_manifest_version(notes: str = ''):
    """Background helper to bump manifest version."""
    try:
        regenerate_manifest()
        logger.info(f"Manifest version bumped: {notes}")
    except Exception as e:
        logger.error(f"Failed to bump manifest version: {e}")


def cleanup_expired_soft_deletes() -> dict:
    """
    Purge soft-deleted assets past the retention window.
    Should be run periodically (via management command or cron).
    """
    from .models import ContentAsset

    retention_days = getattr(settings, 'ORBIS_SOFT_DELETE_RETENTION_DAYS', 7)
    cutoff = timezone.now() - timedelta(days=retention_days)

    expired = ContentAsset.objects.filter(
        status='soft_deleted',
        deleted_at__lt=cutoff,
    )

    purged_count = 0
    for asset in expired:
        abs_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
        if os.path.exists(abs_path):
            os.remove(abs_path)
        asset.status = 'purged'
        asset.save(update_fields=['status'])
        purged_count += 1
        logger.info(f"Auto-purged expired soft-delete: {asset.filename}")

    if purged_count > 0:
        _bump_manifest_version(f"Auto-purge: {purged_count} expired assets")

    return {'purged': purged_count}
