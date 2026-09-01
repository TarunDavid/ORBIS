from rest_framework import serializers
from .models import Student, Grade, Subject, Chapter, ChapterResource

class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = '__all__'

class ChapterResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChapterResource
        fields = ['id', 'resource_type', 'file_path']

class ChapterSerializer(serializers.ModelSerializer):
    resources = ChapterResourceSerializer(many=True, read_only=True)

    class Meta:
        model = Chapter
        fields = ['id', 'identifier', 'title', 'order', 'resources']

class SubjectSerializer(serializers.ModelSerializer):
    chapters = ChapterSerializer(many=True, read_only=True)

    class Meta:
        model = Subject
        fields = ['id', 'identifier', 'display_name', 'chapters']

class GradeSerializer(serializers.ModelSerializer):
    subjects = SubjectSerializer(many=True, read_only=True)

    class Meta:
        model = Grade
        fields = ['id', 'identifier', 'subjects']
