from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    TeacherProfile, ContentAsset, SyncManifestVersion,
    DeviceSyncStatus, TeacherActivityLog,
)


class TeacherProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    assigned_subject_names = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = [
            'id', 'username', 'display_name', 'is_admin',
            'assigned_subject_names', 'created_at',
        ]

    def get_assigned_subject_names(self, obj):
        return [
            {'id': s.id, 'name': s.display_name, 'grade': s.grade.identifier}
            for s in obj.assigned_subjects.all()
        ]


class ContentAssetSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source='subject.display_name', read_only=True)
    chapter_title = serializers.CharField(source='chapter.title', read_only=True)
    grade_name = serializers.CharField(source='subject.grade.identifier', read_only=True)
    days_until_purge = serializers.SerializerMethodField()

    class Meta:
        model = ContentAsset
        fields = [
            'id', 'subject', 'subject_name', 'chapter', 'chapter_title',
            'grade_name', 'content_type', 'filename', 'file_path',
            'size_bytes', 'sha256', 'version', 'uploaded_by',
            'uploaded_by_name', 'uploaded_at', 'status',
            'deleted_at', 'deletion_reason', 'days_until_purge',
        ]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            profile = getattr(obj.uploaded_by, 'teacher_profile', None)
            if profile:
                return profile.display_name
            return obj.uploaded_by.username
        return 'Unknown'

    def get_days_until_purge(self, obj):
        if obj.status == 'soft_deleted' and obj.deleted_at:
            from django.conf import settings
            from django.utils import timezone
            from datetime import timedelta
            retention_days = getattr(settings, 'ORBIS_SOFT_DELETE_RETENTION_DAYS', 7)
            expiry = obj.deleted_at + timedelta(days=retention_days)
            remaining = (expiry - timezone.now()).days
            return max(0, remaining)
        return None


class TeacherActivityLogSerializer(serializers.ModelSerializer):
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = TeacherActivityLog
        fields = [
            'id', 'teacher', 'teacher_name', 'action', 'content_asset',
            'asset_filename', 'subject_name', 'chapter_title',
            'timestamp', 'notes',
        ]

    def get_teacher_name(self, obj):
        if obj.teacher:
            profile = getattr(obj.teacher, 'teacher_profile', None)
            if profile:
                return profile.display_name
            return obj.teacher.username
        return 'Unknown'


class SyncManifestVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncManifestVersion
        fields = ['version_number', 'generated_at', 'manifest_checksum']


class DeviceSyncStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceSyncStatus
        fields = ['device_id', 'device_name', 'last_synced_manifest_version', 'last_synced_at']


class DashboardStatsSerializer(serializers.Serializer):
    """Aggregated dashboard stats for the teacher portal."""
    total_subjects = serializers.IntegerField()
    total_chapters = serializers.IntegerField()
    total_assets = serializers.IntegerField()
    total_size_bytes = serializers.IntegerField()
    total_size_display = serializers.CharField()
    active_assets = serializers.IntegerField()
    soft_deleted_assets = serializers.IntegerField()
    current_manifest_version = serializers.IntegerField()
    last_sync_timestamp = serializers.DateTimeField(allow_null=True)
    devices_total = serializers.IntegerField()
    devices_up_to_date = serializers.IntegerField()
    devices_behind = serializers.IntegerField()
    subject_breakdown = serializers.ListField()
