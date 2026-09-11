"""
Management command to create a teacher account.
Usage: python manage.py create_teacher --username teacher1 --password pass123 --name "Mrs. Sharma" [--admin]
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from api.models import TeacherProfile, Subject


class Command(BaseCommand):
    help = 'Create a teacher account with a TeacherProfile'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, help='Login username')
        parser.add_argument('--password', required=True, help='Login password')
        parser.add_argument('--name', required=True, help='Display name')
        parser.add_argument('--admin', action='store_true', help='Make this teacher an admin (can manage all subjects)')
        parser.add_argument('--subjects', nargs='*', help='Subject IDs to assign (space-separated)')

    def handle(self, *args, **options):
        username = options['username']
        password = options['password']
        display_name = options['name']
        is_admin = options['admin']
        subject_ids = options.get('subjects') or []

        # Check if user already exists
        if User.objects.filter(username=username).exists():
            self.stderr.write(self.style.ERROR(f"User '{username}' already exists."))
            return

        # Create Django User
        user = User.objects.create_user(
            username=username,
            password=password,
            is_staff=True,  # Allow Django admin access
        )

        # Create TeacherProfile
        profile = TeacherProfile.objects.create(
            user=user,
            display_name=display_name,
            is_admin=is_admin,
        )

        # Assign subjects
        if is_admin:
            self.stdout.write(self.style.SUCCESS(f"Admin teacher — access to ALL subjects."))
        elif subject_ids:
            subjects = Subject.objects.filter(pk__in=subject_ids)
            profile.assigned_subjects.set(subjects)
            self.stdout.write(f"Assigned {subjects.count()} subject(s).")
        else:
            # Assign all subjects by default if none specified
            all_subjects = Subject.objects.all()
            profile.assigned_subjects.set(all_subjects)
            self.stdout.write(f"No subjects specified — assigned all {all_subjects.count()} subject(s).")

        self.stdout.write(self.style.SUCCESS(
            f"\n[SUCCESS] Teacher created successfully!"
            f"\n   Username: {username}"
            f"\n   Name:     {display_name}"
            f"\n   Admin:    {'Yes' if is_admin else 'No'}"
            f"\n   Login at: http://localhost:5173/teacher"
        ))
