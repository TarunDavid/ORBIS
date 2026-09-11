import os
import re
import struct
from django.core.management.base import BaseCommand
from django.db import transaction
import sqlean
import sqlite_vec
from sentence_transformers import SentenceTransformer
from api.models import Chapter, ChapterResource, ContentChunk
from ai_engine.context import _extract_pdf_text, _load_transcript

class Command(BaseCommand):
    help = 'Ingests chapter resources (Notes, PDF, Video Transcripts), chunks them, and stores vector embeddings in sqlite-vec.'

    def add_arguments(self, parser):
        parser.add_argument('--chapter-id', type=int, default=None, help='Target a specific chapter ID')
        parser.add_argument('--clear', action='store_true', help='Clear existing chunks before ingestion')

    def handle(self, *args, **options):
        db = sqlean.connect('db.sqlite3', timeout=30.0)
        db.execute("PRAGMA journal_mode=WAL;")
        db.execute("PRAGMA busy_timeout=30000;")
        db.enable_load_extension(True)
        sqlite_vec.load(db)
        
        # Ensure virtual table exists
        db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS vec_content_chunks USING vec0(id INTEGER PRIMARY KEY, embedding float[384]);")
        db.commit()

        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=30000;")

        clear_first = options.get('clear', False)
        target_ch_id = options.get('chapter_id', None)

        if clear_first:
            self.stdout.write(self.style.WARNING("Clearing existing content chunks..."))
            if target_ch_id:
                ContentChunk.objects.filter(chapter_id=target_ch_id).delete()
                db.execute(f"DELETE FROM vec_content_chunks WHERE id NOT IN (SELECT id FROM api_contentchunk)")
            else:
                ContentChunk.objects.all().delete()
                db.execute("DROP TABLE IF EXISTS vec_content_chunks")
                db.execute("CREATE VIRTUAL TABLE vec_content_chunks USING vec0(id INTEGER PRIMARY KEY, embedding float[384]);")
            db.commit()
            self.stdout.write(self.style.SUCCESS("Cleared."))

        self.stdout.write(self.style.NOTICE("Loading embedding model (all-MiniLM-L6-v2)..."))
        embedder = SentenceTransformer('all-MiniLM-L6-v2')
        self.stdout.write(self.style.SUCCESS("Model loaded."))

        qs = Chapter.objects.all()
        if target_ch_id:
            qs = qs.filter(id=target_ch_id)

        for chapter in qs:
            self.stdout.write(self.style.NOTICE(f"Processing Chapter {chapter.id}: {chapter.title}..."))
            
            resources = chapter.resources.all()
            for resource in resources:
                text = ""
                if resource.resource_type in ['notes', 'textbook']:
                    text = _extract_pdf_text(resource.file_path)
                elif resource.resource_type == 'video':
                    text = _load_transcript(resource.file_path)
                
                if not text or len(text.strip()) < 50:
                    continue
                
                chunks = self.chunk_text(text, chunk_size=500, overlap=50)
                
                with transaction.atomic():
                    for idx, chunk_text in enumerate(chunks):
                        # Save to standard Django model
                        chunk_obj = ContentChunk.objects.create(
                            chapter=chapter,
                            resource_type=resource.resource_type,
                            text=chunk_text,
                            order=idx
                        )
                        
                        # Generate embedding
                        embedding = embedder.encode(chunk_text).tolist()
                        vector_bytes = struct.pack(f'{len(embedding)}f', *embedding)
                        
                        try:
                            db.execute("DELETE FROM vec_content_chunks WHERE id=?", (chunk_obj.id,))
                            db.execute(
                                "INSERT INTO vec_content_chunks(id, embedding) VALUES (?, ?)",
                                (chunk_obj.id, vector_bytes)
                            )
                        except Exception as e:
                            print(f"FAILED TO INSERT id={chunk_obj.id} for resource {resource.resource_type}. Error: {e}")
                            raise
                    db.commit()
                self.stdout.write(self.style.SUCCESS(f"  -> {resource.resource_type}: Ingested {len(chunks)} chunks."))
                print(f"DB COUNT after {resource.resource_type}: {ContentChunk.objects.count()}")

        db.close()
        self.stdout.write(self.style.SUCCESS("Ingestion complete."))

    def chunk_text(self, text, chunk_size=500, overlap=50):
        """Splits text into chunks of `chunk_size` characters with `overlap`."""
        words = text.split()
        chunks = []
        current_chunk = []
        current_length = 0
        
        for word in words:
            current_chunk.append(word)
            current_length += len(word) + 1 # +1 for space
            
            if current_length >= chunk_size:
                chunks.append(" ".join(current_chunk))
                # Keep the last few words for overlap
                overlap_words = []
                overlap_length = 0
                for w in reversed(current_chunk):
                    if overlap_length + len(w) > overlap:
                        break
                    overlap_words.insert(0, w)
                    overlap_length += len(w) + 1
                
                current_chunk = overlap_words
                current_length = sum(len(w) + 1 for w in current_chunk)
                
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        return chunks
