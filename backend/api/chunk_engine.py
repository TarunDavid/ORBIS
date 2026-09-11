"""
ORBIS Chunked Download & Delta Sync Engine
===========================================
Handles file chunking, SHA-256 hashing, manifest generation/comparison,
and delta computation for bandwidth-efficient content distribution.

Optimised for low-connectivity environments:
  - 512 KB default chunk size (configurable per content type)
  - Sidecar JSON manifests (no DB overhead)
  - Fast mtime-based cache invalidation
"""

import hashlib
import json
import os
import time
import logging
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Default 512 KB — tuned for slow / intermittent connections
DEFAULT_CHUNK_SIZE = 512 * 1024  # 512 KB

# Per-content-type overrides (bytes)
CONTENT_TYPE_CHUNK_SIZES = {
    'video': 1 * 1024 * 1024,   # 1 MB for large video files (fewer chunks)
    'notes': 256 * 1024,        # 256 KB for small PDFs
    'textbook': 256 * 1024,
    'ppt': 256 * 1024,
}

# File extensions → content category mapping
EXT_TO_CATEGORY = {
    '.mp4': 'video', '.mkv': 'video', '.webm': 'video',
    '.avi': 'video', '.mov': 'video',
    '.pdf': 'notes', '.doc': 'notes', '.docx': 'notes',
    '.ppt': 'ppt', '.pptx': 'ppt', '.odp': 'ppt', '.key': 'ppt',
    '.txt': 'notes', '.srt': 'notes', '.vtt': 'notes',
}

MANIFEST_DIR_NAME = '.orbis_manifests'
MANIFEST_VERSION = 1


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ChunkInfo:
    """Metadata for a single chunk of a file."""
    index: int
    offset: int
    size: int
    sha256: str


@dataclass
class FileManifest:
    """Manifest for a single media file."""
    path: str               # Relative to media root (forward-slash separated)
    size: int
    mtime: float            # Last-modified time (epoch)
    sha256_full: str        # SHA-256 of the entire file
    chunk_size: int         # Chunk size used for this file
    chunks: List[ChunkInfo] = field(default_factory=list)


@dataclass
class MediaManifest:
    """Top-level manifest covering all media files."""
    version: int = MANIFEST_VERSION
    generated_at: float = 0.0
    default_chunk_size: int = DEFAULT_CHUNK_SIZE
    files: List[FileManifest] = field(default_factory=list)


@dataclass
class FileDelta:
    """Delta for a single modified file."""
    path: str
    new_size: int
    old_size: int
    changed_chunks: List[int]       # Indices of chunks that differ
    total_chunks: int
    chunk_size: int
    download_bytes: int             # Bytes that actually need downloading


@dataclass
class DeltaPlan:
    """Full sync delta between client and server."""
    new_files: List[str]            # Paths of files to download in full
    deleted_files: List[str]        # Paths of files to remove locally
    modified_files: List[FileDelta] # Files with partial chunk changes
    unchanged_files: int            # Count of files that match
    total_download_bytes: int       # Total bytes client needs to fetch


# ---------------------------------------------------------------------------
# Hashing helpers
# ---------------------------------------------------------------------------

def hash_chunk(data: bytes) -> str:
    """Return the hex SHA-256 digest of *data*."""
    return hashlib.sha256(data).hexdigest()


def hash_file(file_path: str) -> str:
    """Compute SHA-256 of an entire file, reading in 8 KB blocks."""
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while True:
            block = f.read(8192)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def get_chunk_size_for_file(file_path: str) -> int:
    """Determine the chunk size for a file based on its extension."""
    ext = os.path.splitext(file_path)[1].lower()
    category = EXT_TO_CATEGORY.get(ext)
    if category and category in CONTENT_TYPE_CHUNK_SIZES:
        return CONTENT_TYPE_CHUNK_SIZES[category]
    return DEFAULT_CHUNK_SIZE


def chunk_file(file_path: str, chunk_size: Optional[int] = None) -> List[ChunkInfo]:
    """
    Split *file_path* into fixed-size chunks and compute the SHA-256 of each.

    Returns a list of :class:`ChunkInfo` objects.
    """
    if chunk_size is None:
        chunk_size = get_chunk_size_for_file(file_path)

    chunks: List[ChunkInfo] = []
    with open(file_path, 'rb') as f:
        index = 0
        while True:
            offset = f.tell()
            data = f.read(chunk_size)
            if not data:
                break
            chunks.append(ChunkInfo(
                index=index,
                offset=offset,
                size=len(data),
                sha256=hash_chunk(data),
            ))
            index += 1
    return chunks


# ---------------------------------------------------------------------------
# File manifest
# ---------------------------------------------------------------------------

def generate_file_manifest(file_path: str, media_root: str,
                           chunk_size: Optional[int] = None) -> FileManifest:
    """
    Build a complete manifest for a single file, including per-chunk hashes.
    """
    if chunk_size is None:
        chunk_size = get_chunk_size_for_file(file_path)

    stat = os.stat(file_path)
    rel_path = os.path.relpath(file_path, media_root).replace('\\', '/')

    chunks = chunk_file(file_path, chunk_size)
    full_hash = hash_file(file_path)

    return FileManifest(
        path=rel_path,
        size=stat.st_size,
        mtime=stat.st_mtime,
        sha256_full=full_hash,
        chunk_size=chunk_size,
        chunks=chunks,
    )


# ---------------------------------------------------------------------------
# Media-wide manifest
# ---------------------------------------------------------------------------

def _should_skip(name: str) -> bool:
    """Return True for hidden files / directories and the manifest dir itself."""
    return name.startswith('.') or name == MANIFEST_DIR_NAME


def generate_media_manifest(media_root: Optional[str] = None) -> MediaManifest:
    """
    Walk the entire media tree and produce a :class:`MediaManifest`.

    The manifest is also persisted as a sidecar JSON file so subsequent
    requests can serve the cached version when no files have changed.
    """
    if media_root is None:
        media_root = getattr(settings, 'MEDIA_ROOT', '')

    manifest = MediaManifest(generated_at=time.time())

    if not media_root or not os.path.isdir(media_root):
        logger.warning('Media root does not exist: %s', media_root)
        return manifest

    for root, dirs, files in os.walk(media_root):
        # Prune hidden / manifest directories
        dirs[:] = [d for d in dirs if not _should_skip(d)]
        for fname in sorted(files):
            if _should_skip(fname):
                continue
            abs_path = os.path.join(root, fname)
            try:
                fm = generate_file_manifest(abs_path, media_root)
                manifest.files.append(fm)
            except Exception:
                logger.exception('Failed to process %s', abs_path)

    # Persist as sidecar
    _save_manifest_cache(media_root, manifest)
    return manifest


# ---------------------------------------------------------------------------
# Manifest caching (sidecar files)
# ---------------------------------------------------------------------------

def _manifest_cache_path(media_root: str) -> str:
    cache_dir = os.path.join(media_root, MANIFEST_DIR_NAME)
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, 'manifest.json')


def _save_manifest_cache(media_root: str, manifest: MediaManifest) -> None:
    path = _manifest_cache_path(media_root)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(_manifest_to_dict(manifest), f, indent=2)
    logger.info('Manifest cache written → %s', path)


def load_manifest_cache(media_root: Optional[str] = None) -> Optional[MediaManifest]:
    """Load the cached manifest, or return ``None`` if stale / missing."""
    if media_root is None:
        media_root = getattr(settings, 'MEDIA_ROOT', '')

    path = _manifest_cache_path(media_root)
    if not os.path.exists(path):
        return None

    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    # Staleness check — if *any* media file has an mtime newer than the
    # manifest's generated_at, the cache is invalid.
    generated_at = data.get('generated_at', 0)
    if _any_file_newer(media_root, generated_at):
        logger.info('Manifest cache is stale, regenerating')
        return None

    return _dict_to_manifest(data)


def _any_file_newer(media_root: str, threshold: float) -> bool:
    """Return True if any non-hidden file under *media_root* was modified
    after *threshold* (epoch seconds)."""
    for root, dirs, files in os.walk(media_root):
        dirs[:] = [d for d in dirs if not _should_skip(d)]
        for fname in files:
            if _should_skip(fname):
                continue
            try:
                if os.stat(os.path.join(root, fname)).st_mtime > threshold:
                    return True
            except OSError:
                continue
    return False


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _manifest_to_dict(manifest: MediaManifest) -> dict:
    """Recursively convert dataclass → plain dict (JSON-safe)."""
    return {
        'version': manifest.version,
        'generated_at': manifest.generated_at,
        'default_chunk_size': manifest.default_chunk_size,
        'files': [
            {
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
            }
            for fm in manifest.files
        ],
    }


def _dict_to_manifest(data: dict) -> MediaManifest:
    """Rebuild a :class:`MediaManifest` from a plain dict."""
    manifest = MediaManifest(
        version=data.get('version', MANIFEST_VERSION),
        generated_at=data.get('generated_at', 0),
        default_chunk_size=data.get('default_chunk_size', DEFAULT_CHUNK_SIZE),
    )
    for fd in data.get('files', []):
        fm = FileManifest(
            path=fd['path'],
            size=fd['size'],
            mtime=fd.get('mtime', 0),
            sha256_full=fd['sha256_full'],
            chunk_size=fd.get('chunk_size', DEFAULT_CHUNK_SIZE),
            chunks=[
                ChunkInfo(
                    index=c['index'],
                    offset=c['offset'],
                    size=c['size'],
                    sha256=c['sha256'],
                )
                for c in fd.get('chunks', [])
            ],
        )
        manifest.files.append(fm)
    return manifest


def manifest_to_json(manifest: MediaManifest) -> str:
    """Serialise a manifest to a JSON string."""
    return json.dumps(_manifest_to_dict(manifest))


def manifest_from_json(json_str: str) -> MediaManifest:
    """Deserialise a manifest from a JSON string."""
    return _dict_to_manifest(json.loads(json_str))


# ---------------------------------------------------------------------------
# Delta / diff computation
# ---------------------------------------------------------------------------

def diff_manifests(client_manifest: MediaManifest,
                   server_manifest: MediaManifest) -> DeltaPlan:
    """
    Compare a client-side manifest against the server-side manifest and
    compute the minimal set of operations needed to bring the client up to
    date.

    Returns a :class:`DeltaPlan`.
    """
    client_map: Dict[str, FileManifest] = {
        fm.path: fm for fm in client_manifest.files
    }
    server_map: Dict[str, FileManifest] = {
        fm.path: fm for fm in server_manifest.files
    }

    new_files: List[str] = []
    deleted_files: List[str] = []
    modified_files: List[FileDelta] = []
    unchanged = 0
    total_download = 0

    # Files on server but not on client → new
    for path, sfm in server_map.items():
        if path not in client_map:
            new_files.append(path)
            total_download += sfm.size

    # Files on client but not on server → deleted
    for path in client_map:
        if path not in server_map:
            deleted_files.append(path)

    # Files on both → compare chunk hashes
    for path, sfm in server_map.items():
        if path not in client_map:
            continue
        cfm = client_map[path]

        # Quick check: if full-file hash matches, skip
        if cfm.sha256_full == sfm.sha256_full:
            unchanged += 1
            continue

        # Chunk-level diff
        client_chunks = {c.index: c.sha256 for c in cfm.chunks}
        changed: List[int] = []
        download_bytes = 0

        for sc in sfm.chunks:
            if client_chunks.get(sc.index) != sc.sha256:
                changed.append(sc.index)
                download_bytes += sc.size

        if changed:
            modified_files.append(FileDelta(
                path=path,
                new_size=sfm.size,
                old_size=cfm.size,
                changed_chunks=changed,
                total_chunks=len(sfm.chunks),
                chunk_size=sfm.chunk_size,
                download_bytes=download_bytes,
            ))
            total_download += download_bytes
        else:
            # Hashes differ but no chunk diff — edge case (e.g. chunk size changed)
            # Treat as new download
            new_files.append(path)
            total_download += sfm.size

    return DeltaPlan(
        new_files=new_files,
        deleted_files=deleted_files,
        modified_files=modified_files,
        unchanged_files=unchanged,
        total_download_bytes=total_download,
    )


# ---------------------------------------------------------------------------
# Convenience: get or regenerate manifest
# ---------------------------------------------------------------------------

def get_or_generate_manifest(media_root: Optional[str] = None) -> MediaManifest:
    """Return cached manifest if fresh, otherwise regenerate."""
    cached = load_manifest_cache(media_root)
    if cached is not None:
        return cached
    return generate_media_manifest(media_root)
