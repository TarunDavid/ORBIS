"""
Seed initial Grade → Subject → Chapter data for development.

Usage:
    python manage.py seed_content
"""

from django.core.management.base import BaseCommand
from api.models import Grade, Subject, Chapter


SEED_DATA = {
    "Grade 5": {
        "mathematics": {
            "display_name": "Mathematics",
            "chapters": [
                "Shapes and Angles",
                "How Many Squares?",
                "Parts and Wholes",
                "Does It Look the Same?",
                "Be My Multiple, I'll Be Your Factor",
            ],
        },
        "science": {
            "display_name": "Science",
            "chapters": [
                "Super Senses",
                "A Snake Charmer's Story",
                "From Tasting to Digesting",
                "Mangoes Round the Year",
                "Seeds and Seeds",
            ],
        },
        "english": {
            "display_name": "English",
            "chapters": [
                "Wonderful Waste",
                "Flying Together",
                "My Shadow",
                "Robinson Crusoe",
                "Gulliver's Travels",
            ],
        },
        "social_science": {
            "display_name": "Social Science",
            "chapters": [
                "Super Senses - History",
                "Experiments with Water",
                "A Treat for Mosquitoes",
                "Across the Wall",
                "Walls Tell Stories",
            ],
        },
        "hindi": {
            "display_name": "Hindi",
            "chapters": [
                "Rah ka Saathi",
                "Faslon ke Tyohaar",
                "Jahan Chahah Wahan Raah",
                "Khai Badi ya Khai Choti",
                "Paheliyan",
            ],
        },
        "kannada": {
            "display_name": "Kannada",
            "chapters": [
                "Namma Desha Namma Hemmae",
                "Shaalegae Hogona Baanni",
                "Haadu Paadu",
                "Namma Suttamuttalina Parisara",
                "Aata Paata",
            ],
        },
    },
    "Grade 6": {
        "mathematics": {
            "display_name": "Mathematics",
            "chapters": [
                "Knowing Our Numbers",
                "Whole Numbers",
                "Playing with Numbers",
                "Basic Geometrical Ideas",
                "Understanding Elementary Shapes",
            ],
        },
        "science": {
            "display_name": "Science",
            "chapters": [
                "Food: Where Does It Come From?",
                "Components of Food",
                "Fibre to Fabric",
                "Sorting Materials into Groups",
                "Separation of Substances",
            ],
        },
        "english": {
            "display_name": "English",
            "chapters": [
                "Who Did Patrick's Homework?",
                "How the Dog Found Himself a New Master!",
                "Taro's Reward",
                "An Indian – American Woman in Space",
                "A Different Kind of School",
            ],
        },
        "social_science": {
            "display_name": "Social Science",
            "chapters": [
                "What, Where, How and When?",
                "From Hunting–Gathering to Growing Food",
                "In the Earliest Cities",
                "What Books and Burials Tell Us",
                "Kingdoms, Kings and an Early Republic",
            ],
        },
    },
}


class Command(BaseCommand):
    help = "Seed Grade, Subject, and Chapter data for development."

    def handle(self, *args, **options):
        created_grades = 0
        created_subjects = 0
        created_chapters = 0

        for grade_name, subjects in SEED_DATA.items():
            grade, g_created = Grade.objects.get_or_create(identifier=grade_name)
            if g_created:
                created_grades += 1

            for subj_key, subj_info in subjects.items():
                subject, s_created = Subject.objects.get_or_create(
                    identifier=subj_key,
                    grade=grade,
                    defaults={"display_name": subj_info["display_name"]},
                )
                if s_created:
                    created_subjects += 1

                for order, chapter_title in enumerate(subj_info["chapters"], start=1):
                    chapter_id = chapter_title.lower().replace(" ", "_").replace("'", "")
                    _, c_created = Chapter.objects.get_or_create(
                        identifier=chapter_id,
                        subject=subject,
                        defaults={"title": chapter_title, "order": order},
                    )
                    if c_created:
                        created_chapters += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created_grades} grades, {created_subjects} subjects, "
                f"{created_chapters} chapters."
            )
        )
