import os
import sys
import json

# Mock Django settings to allow rag.py to import
class MockSettings:
    MEDIA_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'media')
    
sys.modules['django'] = type('MockDjango', (), {})
sys.modules['django.conf'] = type('MockDjangoConf', (), {'settings': MockSettings()})

from ai_engine.rag import RAGService

def test():
    rag = RAGService.get_instance()
    
    print("Building index for chapter 999...")
    resources = [
        {'text': 'The mitochondria is the powerhouse of the cell.', 'source_type': 'notes'},
        {'text': 'Photosynthesis converts light energy into chemical energy.', 'source_type': 'textbook'},
        {'text': 'Welcome to this biology video. Today we learn about cells.', 'source_type': 'video transcript'},
    ]
    rag.build_index(999, resources)
    
    idx_path = rag._get_chapter_index_path(999)
    meta_path = rag._get_chapter_metadata_path(999)
    print(f"Index exists: {os.path.exists(idx_path)}")
    print(f"Metadata exists: {os.path.exists(meta_path)}")
    
    print("\nQuerying chapter 999 (should load from disk into cache)...")
    res1 = rag.retrieve_for_query(999, "What is mitochondria?", k=1)
    print(f"Result 1: {res1[0]['text'] if res1 else 'No results'}")
    print(f"Active chapter in cache: {rag.active_chapter_id}")
    
    print("\nQuerying chapter 999 again (should use cache, no disk read)...")
    res2 = rag.retrieve_for_query(999, "What is photosynthesis?", k=1)
    print(f"Result 2: {res2[0]['text'] if res2 else 'No results'}")
    
    print("\nRemoving index for chapter 999...")
    rag.remove_index(999)
    print(f"Index exists after removal: {os.path.exists(idx_path)}")
    print(f"Active chapter in cache after removal: {rag.active_chapter_id}")

if __name__ == '__main__':
    test()
