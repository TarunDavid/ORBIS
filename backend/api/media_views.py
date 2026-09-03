import os
import re
import mimetypes
from wsgiref.util import FileWrapper
from django.http import StreamingHttpResponse, Http404
from django.conf import settings

def serve_media_with_range(request, path):
    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(file_path):
        raise Http404()

    statobj = os.stat(file_path)
    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "application/octet-stream"

    range_header = request.META.get('HTTP_RANGE', '').strip()
    range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)

    if range_match:
        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte) if first_byte else 0
        last_byte = int(last_byte) if last_byte else statobj.st_size - 1
        
        last_byte = min(last_byte, statobj.st_size - 1)
        length = last_byte - first_byte + 1

        def file_iterator(file_path, offset, length, chunk_size=8192):
            with open(file_path, 'rb') as f:
                f.seek(offset)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    yield chunk
                    remaining -= len(chunk)

        response = StreamingHttpResponse(file_iterator(file_path, first_byte, length), status=206, content_type=content_type)
        response['Content-Length'] = str(length)
        response['Content-Range'] = f'bytes {first_byte}-{last_byte}/{statobj.st_size}'
        response['Accept-Ranges'] = 'bytes'
    else:
        response = StreamingHttpResponse(FileWrapper(open(file_path, 'rb')), content_type=content_type)
        response['Content-Length'] = str(statobj.st_size)
        response['Accept-Ranges'] = 'bytes'

    return response
