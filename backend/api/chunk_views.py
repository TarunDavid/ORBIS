"""
ORBIS Chunked Sync REST API Views
==================================
Endpoints for manifest retrieval, delta computation, and chunk serving
with HTTP Range Request support and SHA-256 integrity headers.
"""

import os
import mimetypes
import logging

from django.conf import settings
from django.http import StreamingHttpResponse, Http404, JsonResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from .chunk_engine import (
    get_or_generate_manifest,
    generate_media_manifest,
    manifest_to_json,
    manifest_from_json,
    diff_manifests,
    generate_file_manifest,
    hash_chunk,
    _manifest_to_dict,
    MediaManifest,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# GET /api/sync/manifest/
# ---------------------------------------------------------------------------

@api_view(['GET'])
def get_manifest(request):
    """
    Return the current server-side media manifest.

    Query params:
        ?force=1  — regenerate even if cache is fresh.
    """
    force = request.query_params.get('force', '0') == '1'

    media_root = settings.MEDIA_ROOT

    if force:
        manifest = generate_media_manifest(media_root)
    else:
        manifest = get_or_generate_manifest(media_root)

    data = _manifest_to_dict(manifest)
    data['total_files'] = len(manifest.files)
    data['total_bytes'] = sum(fm.size for fm in manifest.files)

    return Response(data)


# ---------------------------------------------------------------------------
# POST /api/sync/diff/
# ---------------------------------------------------------------------------

@api_view(['POST'])
@parser_classes([JSONParser])
def compute_diff(request):
    """
    Accept a client manifest and return a delta plan.

    Request body: full client manifest JSON.
    Response: DeltaPlan JSON.
    """
    try:
        client_data = request.data
        if not client_data or 'files' not in client_data:
            return Response(
                {'error': 'Request body must contain a valid manifest with "files" key.'},
                status=400,
            )

        client_manifest = manifest_from_json(
            # The request.data is already parsed; re-serialise for the helper.
            __import__('json').dumps(client_data)
        )
    except Exception as exc:
        logger.exception('Failed to parse client manifest')
        return Response({'error': f'Invalid manifest: {exc}'}, status=400)

    server_manifest = get_or_generate_manifest()

    delta = diff_manifests(client_manifest, server_manifest)

    return Response({
        'new_files': delta.new_files,
        'deleted_files': delta.deleted_files,
        'modified_files': [
            {
                'path': fd.path,
                'new_size': fd.new_size,
                'old_size': fd.old_size,
                'changed_chunks': fd.changed_chunks,
                'total_chunks': fd.total_chunks,
                'chunk_size': fd.chunk_size,
                'download_bytes': fd.download_bytes,
            }
            for fd in delta.modified_files
        ],
        'unchanged_files': delta.unchanged_files,
        'total_download_bytes': delta.total_download_bytes,
    })


# ---------------------------------------------------------------------------
# GET /api/sync/chunk/<path>?offset=<n>&size=<n>
# ---------------------------------------------------------------------------

@api_view(['GET'])
def serve_chunk(request, file_path):
    """
    Serve a specific chunk of a media file.

    Query params:
        offset (int) — byte offset into the file (required)
        size   (int) — number of bytes to read (required)

    Response headers:
        Content-Type           — guessed from file extension
        Content-Length         — actual bytes returned
        Accept-Ranges          — bytes
        X-Chunk-SHA256         — SHA-256 of the returned chunk (for verification)
        Content-Range          — byte range served
    """
    abs_path = os.path.join(settings.MEDIA_ROOT, file_path)

    # Security: ensure the resolved path is within MEDIA_ROOT
    abs_path = os.path.realpath(abs_path)
    media_real = os.path.realpath(settings.MEDIA_ROOT)
    if not abs_path.startswith(media_real):
        raise Http404('Path traversal denied')

    if not os.path.isfile(abs_path):
        raise Http404('File not found')

    # Parse query params
    try:
        offset = int(request.query_params.get('offset', 0))
        size = int(request.query_params.get('size', 0))
    except (ValueError, TypeError):
        return Response({'error': 'offset and size must be integers'}, status=400)

    if size <= 0:
        return Response({'error': 'size must be a positive integer'}, status=400)

    file_size = os.path.getsize(abs_path)
    if offset < 0 or offset >= file_size:
        return Response({'error': 'offset out of range'}, status=416)

    # Clamp size to file boundary
    actual_size = min(size, file_size - offset)

    # Read the chunk
    with open(abs_path, 'rb') as f:
        f.seek(offset)
        chunk_data = f.read(actual_size)

    chunk_hash = hash_chunk(chunk_data)

    content_type, _ = mimetypes.guess_type(abs_path)
    if not content_type:
        content_type = 'application/octet-stream'

    response = StreamingHttpResponse(
        iter([chunk_data]),
        status=206,
        content_type=content_type,
    )
    response['Content-Length'] = str(len(chunk_data))
    response['Content-Range'] = f'bytes {offset}-{offset + len(chunk_data) - 1}/{file_size}'
    response['Accept-Ranges'] = 'bytes'
    response['X-Chunk-SHA256'] = chunk_hash
    # Allow frontend to read the custom header
    response['Access-Control-Expose-Headers'] = 'X-Chunk-SHA256, Content-Range'

    return response


# ---------------------------------------------------------------------------
# GET /api/sync/file-manifest/<path>/
# ---------------------------------------------------------------------------

@api_view(['GET'])
def get_file_manifest(request, file_path):
    """
    Return the chunk manifest for a single file.
    Useful for partial re-sync of individual resources.
    """
    abs_path = os.path.join(settings.MEDIA_ROOT, file_path)
    abs_path = os.path.realpath(abs_path)
    media_real = os.path.realpath(settings.MEDIA_ROOT)

    if not abs_path.startswith(media_real):
        raise Http404('Path traversal denied')

    if not os.path.isfile(abs_path):
        raise Http404('File not found')

    try:
        fm = generate_file_manifest(abs_path, settings.MEDIA_ROOT)
    except Exception as exc:
        logger.exception('Failed to generate file manifest for %s', file_path)
        return Response({'error': str(exc)}, status=500)

    return Response({
        'path': fm.path,
        'size': fm.size,
        'mtime': fm.mtime,
        'sha256_full': fm.sha256_full,
        'chunk_size': fm.chunk_size,
        'chunks': [
            {
                'index': c.index,
                'offset': c.offset,
                'size': c.size,
                'sha256': c.sha256,
            }
            for c in fm.chunks
        ],
    })


# ---------------------------------------------------------------------------
# POST /api/sync/regenerate/
# ---------------------------------------------------------------------------

@api_view(['POST'])
def regenerate_manifest(request):
    """
    Force-regenerate the server manifest.
    Useful after content uploads or media-folder changes.
    """
    try:
        manifest = generate_media_manifest(settings.MEDIA_ROOT)
        return Response({
            'status': 'ok',
            'total_files': len(manifest.files),
            'total_bytes': sum(fm.size for fm in manifest.files),
            'generated_at': manifest.generated_at,
        })
    except Exception as exc:
        logger.exception('Manifest regeneration failed')
        return Response({'error': str(exc)}, status=500)
