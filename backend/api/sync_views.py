import os
import json
import zipfile
import tempfile
import shutil
from django.conf import settings
from django.core import serializers
from django.http import FileResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from .models import Grade, Subject, Chapter, ChapterResource

@api_view(['GET'])
def export_sync(request):
    """
    Exports curriculum data (Grade, Subject, Chapter, ChapterResource)
    and all media files into a single .orbis (zip) package.
    """
    try:
        # 1. Serialize Curriculum Models to JSON
        models_to_sync = [Grade, Subject, Chapter, ChapterResource]
        all_objects = []
        for model in models_to_sync:
            all_objects.extend(model.objects.all())
        
        manifest_json = serializers.serialize("json", all_objects)

        # 2. Create a temporary zip file
        fd, temp_zip_path = tempfile.mkstemp(suffix='.orbis')
        os.close(fd)

        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Write the manifest
            zipf.writestr('manifest.json', manifest_json)
            
            # Write all media files
            media_root = settings.MEDIA_ROOT
            if os.path.exists(media_root):
                for root, dirs, files in os.walk(media_root):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Archive name is relative to MEDIA_ROOT
                        arcname = os.path.join('media', os.path.relpath(file_path, media_root))
                        zipf.write(file_path, arcname)

        # 3. Return the file
        response = FileResponse(open(temp_zip_path, 'rb'), as_attachment=True, filename='curriculum_sync.orbis')
        return response

    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)


@api_view(['POST'])
@parser_classes([MultiPartParser])
def import_sync(request):
    """
    Accepts a .orbis file, extracts it, imports the DB manifest,
    and copies the media files to the local MEDIA_ROOT.
    """
    if 'file' not in request.FILES:
        return Response({"error": "No file uploaded"}, status=400)
        
    sync_file = request.FILES['file']
    
    # Save the uploaded file temporarily
    fd, temp_upload_path = tempfile.mkstemp(suffix='.orbis')
    with os.fdopen(fd, 'wb') as f:
        for chunk in sync_file.chunks():
            f.write(chunk)

    temp_extract_dir = tempfile.mkdtemp()
    
    try:
        # 1. Extract the zip
        with zipfile.ZipFile(temp_upload_path, 'r') as zipf:
            zipf.extractall(temp_extract_dir)
            
        manifest_path = os.path.join(temp_extract_dir, 'manifest.json')
        if not os.path.exists(manifest_path):
            return Response({"error": "Invalid .orbis package: manifest.json missing"}, status=400)
            
        # 2. Load the JSON into the Database
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest_data = f.read()
            
        for obj in serializers.deserialize("json", manifest_data):
            obj.save()
            
        # 3. Move media files
        extracted_media_dir = os.path.join(temp_extract_dir, 'media')
        if os.path.exists(extracted_media_dir):
            target_media_dir = settings.MEDIA_ROOT
            os.makedirs(target_media_dir, exist_ok=True)
            # Copy all files from extracted_media_dir to target_media_dir, overwriting existing
            for root, dirs, files in os.walk(extracted_media_dir):
                for file in files:
                    src_file = os.path.join(root, file)
                    rel_path = os.path.relpath(src_file, extracted_media_dir)
                    dst_file = os.path.join(target_media_dir, rel_path)
                    os.makedirs(os.path.dirname(dst_file), exist_ok=True)
                    shutil.copy2(src_file, dst_file)
                    
        return Response({"status": "Success", "message": "Content synchronized successfully!"})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)
    finally:
        # Cleanup temp files
        if os.path.exists(temp_upload_path):
            os.remove(temp_upload_path)
        if os.path.exists(temp_extract_dir):
            shutil.rmtree(temp_extract_dir)
