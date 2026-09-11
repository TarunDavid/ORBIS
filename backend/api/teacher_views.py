"""
ORBIS Teacher Portal — API Views
=================================
All teacher-facing endpoints: login, dashboard, content CRUD, activity feed.
"""
import os
from django.contrib.auth import authenticate, login, logout
from django.db.models import Sum, Count, Q
from django.conf import settings
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import (
    Subject, Chapter, Grade, ChapterResource,
    ContentAsset, SyncManifestVersion, DeviceSyncStatus,
    TeacherProfile, TeacherActivityLog,
)
from .teacher_serializers import (
    TeacherProfileSerializer, ContentAssetSerializer,
    TeacherActivityLogSerializer, DashboardStatsSerializer,
)
from .content_pipeline import process_upload, process_deletion, process_restore


def _get_teacher_or_error(request):
    """Helper to check if request user is an authenticated teacher."""
    if not request.user.is_authenticated:
        return None, Response({'error': 'Authentication required. Please login at /api/teacher/login/'}, status=401)
    try:
        profile = request.user.teacher_profile
        return profile, None
    except TeacherProfile.DoesNotExist:
        return None, Response({'error': 'Your account is not registered as a teacher.'}, status=403)


@api_view(['POST'])
def teacher_login(request):
    """Authenticate a teacher and start a session."""
    username = request.data.get('username', '')
    password = request.data.get('password', '')

    if not username or not password:
        return Response({'error': 'Username and password are required'}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials'}, status=401)

    # Verify this user has a teacher profile
    try:
        profile = user.teacher_profile
    except TeacherProfile.DoesNotExist:
        return Response({'error': 'This account is not registered as a teacher.'}, status=403)

    login(request, user)
    return Response({
        'success': True,
        'teacher': TeacherProfileSerializer(profile).data,
    })


@api_view(['POST'])
def teacher_logout(request):
    """End the teacher session."""
    logout(request)
    return Response({'success': True})


@api_view(['GET'])
def teacher_me(request):
    """Get the current teacher's profile."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error
    return Response(TeacherProfileSerializer(profile).data)


@api_view(['GET'])
def teacher_dashboard(request):
    """Aggregated stats for the teacher dashboard."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    # Filter subjects by assignment (unless admin)
    if profile.is_admin:
        subjects = Subject.objects.all()
    else:
        subjects = profile.assigned_subjects.all()

    subject_ids = subjects.values_list('id', flat=True)

    # Count chapters
    total_chapters = Chapter.objects.filter(subject_id__in=subject_ids).count()

    # Content asset stats
    assets_qs = ContentAsset.objects.filter(subject_id__in=subject_ids)
    active_assets = assets_qs.filter(status='active')
    soft_deleted_assets = assets_qs.filter(status='soft_deleted')

    total_size = active_assets.aggregate(total=Sum('size_bytes'))['total'] or 0

    # Format size
    if total_size >= 1024 * 1024 * 1024:
        size_display = f"{total_size / (1024**3):.1f} GB"
    elif total_size >= 1024 * 1024:
        size_display = f"{total_size / (1024**2):.1f} MB"
    else:
        size_display = f"{total_size / 1024:.1f} KB"

    # Manifest version
    latest_manifest = SyncManifestVersion.objects.first()
    current_version = latest_manifest.version_number if latest_manifest else 0
    last_sync_ts = latest_manifest.generated_at if latest_manifest else None

    # Device sync status
    devices_total = DeviceSyncStatus.objects.count()
    devices_up_to_date = DeviceSyncStatus.objects.filter(
        last_synced_manifest_version__gte=current_version
    ).count() if current_version > 0 else devices_total
    devices_behind = devices_total - devices_up_to_date

    # Per-subject breakdown
    subject_breakdown = []
    for subj in subjects.select_related('grade'):
        subj_assets = ContentAsset.objects.filter(subject=subj, status='active')
        subj_size = subj_assets.aggregate(total=Sum('size_bytes'))['total'] or 0
        subj_chapters = Chapter.objects.filter(subject=subj).count()
        last_upload = subj_assets.order_by('-uploaded_at').first()
        subject_breakdown.append({
            'id': subj.id,
            'name': subj.display_name,
            'grade': subj.grade.identifier,
            'chapters': subj_chapters,
            'files': subj_assets.count(),
            'size_bytes': subj_size,
            'size_display': f"{subj_size / (1024**2):.1f} MB" if subj_size >= 1024*1024 else f"{subj_size / 1024:.1f} KB",
            'last_modified': last_upload.uploaded_at.isoformat() if last_upload else None,
        })

    data = {
        'total_subjects': subjects.count(),
        'total_chapters': total_chapters,
        'total_assets': active_assets.count(),
        'total_size_bytes': total_size,
        'total_size_display': size_display,
        'active_assets': active_assets.count(),
        'soft_deleted_assets': soft_deleted_assets.count(),
        'current_manifest_version': current_version,
        'last_sync_timestamp': last_sync_ts,
        'devices_total': devices_total,
        'devices_up_to_date': devices_up_to_date,
        'devices_behind': devices_behind,
        'subject_breakdown': subject_breakdown,
    }

    return Response(data)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def teacher_content_upload(request):
    """
    Upload content file(s). Streams large files to disk.
    Expects: file, subject_id, chapter_id, content_type
    """
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    files = request.FILES.getlist('file')
    if not files:
        # Try singular 'file' key
        single = request.FILES.get('file')
        if single:
            files = [single]
        else:
            return Response({'error': 'No file(s) uploaded'}, status=400)

    subject_id = request.data.get('subject_id')
    chapter_id = request.data.get('chapter_id')
    content_type = request.data.get('content_type')

    if not subject_id or not chapter_id or not content_type:
        return Response({
            'error': 'subject_id, chapter_id, and content_type are required'
        }, status=400)

    # RBAC: check subject assignment
    try:
        subject = Subject.objects.get(pk=subject_id)
    except Subject.DoesNotExist:
        return Response({'error': 'Subject not found'}, status=404)

    if not profile.can_manage_subject(subject):
        return Response({'error': 'You do not have permission to manage this subject'}, status=403)

    results = []
    for uploaded_file in files:
        result = process_upload(
            uploaded_file=uploaded_file,
            subject_id=int(subject_id),
            chapter_id=int(chapter_id),
            content_type=content_type,
            teacher_user=request.user,
        )
        results.append(result)

    # Check if all succeeded
    all_success = all(r['success'] for r in results)
    return Response({
        'success': all_success,
        'results': results,
    }, status=201 if all_success else 400)


@api_view(['GET'])
def teacher_content_list(request):
    """List all content assets, filterable by subject, chapter, status."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    if profile.is_admin:
        qs = ContentAsset.objects.all()
    else:
        subject_ids = profile.assigned_subjects.values_list('id', flat=True)
        qs = ContentAsset.objects.filter(subject_id__in=subject_ids)

    # Filters
    subject_id = request.query_params.get('subject_id')
    chapter_id = request.query_params.get('chapter_id')
    status = request.query_params.get('status')
    content_type = request.query_params.get('content_type')

    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if chapter_id:
        qs = qs.filter(chapter_id=chapter_id)
    if status:
        qs = qs.filter(status=status)
    if content_type:
        qs = qs.filter(content_type=content_type)

    # Exclude purged by default (unless explicitly requested)
    if not status:
        qs = qs.exclude(status='purged')

    serializer = ContentAssetSerializer(qs.select_related('subject', 'chapter', 'subject__grade', 'uploaded_by'), many=True)
    return Response(serializer.data)


@api_view(['DELETE'])
def teacher_content_delete(request, pk):
    """Soft or hard delete a content asset. Use ?mode=soft or ?mode=hard."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    try:
        asset = ContentAsset.objects.select_related('subject').get(pk=pk)
    except ContentAsset.DoesNotExist:
        return Response({'error': 'Content asset not found'}, status=404)

    # RBAC
    if not profile.can_manage_subject(asset.subject):
        return Response({'error': 'You do not have permission to manage this subject'}, status=403)

    mode = request.query_params.get('mode', 'soft')
    reason = request.data.get('reason', '')

    result = process_deletion(
        content_asset_id=pk,
        mode=mode,
        reason=reason,
        teacher_user=request.user,
    )

    if result['success']:
        return Response(result)
    else:
        return Response(result, status=400)


@api_view(['POST'])
def teacher_content_restore(request, pk):
    """Restore a soft-deleted content asset."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    try:
        asset = ContentAsset.objects.select_related('subject').get(pk=pk)
    except ContentAsset.DoesNotExist:
        return Response({'error': 'Content asset not found'}, status=404)

    # RBAC
    if not profile.can_manage_subject(asset.subject):
        return Response({'error': 'You do not have permission to manage this subject'}, status=403)

    result = process_restore(
        content_asset_id=pk,
        teacher_user=request.user,
    )

    if result['success']:
        return Response(result)
    else:
        return Response(result, status=400)


@api_view(['GET'])
def teacher_activity_feed(request):
    """Paginated activity feed for the teacher portal."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    qs = TeacherActivityLog.objects.all()

    # Non-admin teachers only see their own activity
    if not profile.is_admin:
        qs = qs.filter(teacher=request.user)

    # Pagination
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))
    total = qs.count()

    serializer = TeacherActivityLogSerializer(qs[offset:offset+limit], many=True)
    return Response({
        'total': total,
        'limit': limit,
        'offset': offset,
        'results': serializer.data,
    })


@api_view(['GET'])
def teacher_subjects_chapters(request):
    """List all subjects and their chapters (for upload form dropdowns)."""
    profile, error = _get_teacher_or_error(request)
    if error:
        return error

    if profile.is_admin:
        grades = Grade.objects.prefetch_related('subjects__chapters').all()
    else:
        subject_ids = profile.assigned_subjects.values_list('id', flat=True)
        grades = Grade.objects.filter(
            subjects__id__in=subject_ids
        ).distinct().prefetch_related('subjects__chapters')

    data = []
    for grade in grades:
        subjects_list = []
        for subj in grade.subjects.all():
            if not profile.is_admin and subj.id not in profile.assigned_subjects.values_list('id', flat=True):
                continue
            chapters_list = [
                {'id': ch.id, 'title': ch.title, 'order': ch.order}
                for ch in subj.chapters.all().order_by('order')
            ]
            subjects_list.append({
                'id': subj.id,
                'name': subj.display_name,
                'identifier': subj.identifier,
                'chapters': chapters_list,
            })
        if subjects_list:
            data.append({
                'id': grade.id,
                'name': grade.identifier,
                'subjects': subjects_list,
            })

    return Response(data)
