"""Photos attached to community posts: read an upload, re-encode it, store it on disk.

Every upload is decoded with Pillow and saved again as WebP, so nothing the user's camera
wrote travels on: no EXIF (GPS position, device, time), no XMP, no ICC profile, no comments.
The file name is a random token, never the name the user sent. Files live in UPLOAD_DIR
(settings.upload_dir; default backend/uploads/).
"""

import secrets
from dataclasses import dataclass
from email.message import Message
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

MAX_BYTES = 5 * 1024 * 1024
MAX_SIDE = 1600
WEBP_QUALITY = 82
# MPO is a JPEG holding several frames (iPhone HDR, Samsung and other phones); the first
# frame is the photo.
ACCEPTED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP"}
# Decompression bombs: a small file that decodes to a huge bitmap. 100 megapixels lets the
# 48-50 MP photos of today's phones through; checked from the header (Pillow refuses above twice
# this) and both are refused here as TooManyPixels.
MAX_PIXELS = 100_000_000
# Room for the multipart boundaries, the part headers and the caption around the file.
MULTIPART_OVERHEAD = 64 * 1024
DEFAULT_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"


class TooLarge(Exception):
    """More than MAX_BYTES."""


class TooManyPixels(Exception):
    """More than MAX_PIXELS once decoded (possibly a decompression bomb)."""


class NotAnImage(Exception):
    """Not a JPEG, PNG or WebP image Pillow can open."""


class BadForm(Exception):
    """The multipart body is malformed or misses the file."""


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes  # WebP
    width: int
    height: int


def upload_dir() -> Path:
    configured = get_settings().upload_dir
    path = Path(configured) if configured else DEFAULT_UPLOAD_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def _check(image: Image.Image) -> None:
    """Refuse before decoding: an unaccepted format, or more than MAX_PIXELS (the size is
    read from the header, so a decompression bomb is never decoded)."""
    if image.format not in ACCEPTED_FORMATS:
        raise NotAnImage
    width, height = image.size
    if width * height > MAX_PIXELS:
        raise TooManyPixels


def process(data: bytes) -> ProcessedImage:
    """Decode, turn upright (EXIF orientation), flatten to RGB, shrink to MAX_SIDE and encode
    as WebP with no metadata at all."""
    if len(data) > MAX_BYTES:
        raise TooLarge
    # A second line of defence: Pillow itself refuses above twice this.
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(BytesIO(data)) as probe:
            _check(probe)
            probe.verify()  # a truncated or corrupt file fails here
        with Image.open(BytesIO(data)) as opened:
            _check(opened)
            opened.seek(0)  # MPO: the first frame
            upright = ImageOps.exif_transpose(opened)
            if upright.mode in ("RGBA", "LA") or (
                upright.mode == "P" and "transparency" in upright.info
            ):
                rgba = upright.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, (255, 255, 255))
                rgb.paste(rgba, mask=rgba.getchannel("A"))
            else:
                rgb = upright.convert("RGB")
            rgb.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            # A fresh image carries no info dict (EXIF, ICC, XMP, comments) from the upload.
            clean = Image.new("RGB", rgb.size)
            clean.paste(rgb)
    except Image.DecompressionBombError as e:
        raise TooManyPixels from e
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as e:
        raise NotAnImage from e
    out = BytesIO()
    clean.save(out, "WEBP", quality=WEBP_QUALITY, exif=b"", icc_profile=None, xmp=b"")
    return ProcessedImage(out.getvalue(), clean.width, clean.height)


def save(image: ProcessedImage) -> str:
    """Write the file under a random name; return the name."""
    name = f"{secrets.token_urlsafe(24)}.webp"
    (upload_dir() / name).write_bytes(image.data)
    return name


def path_of(file_name: str) -> Path | None:
    """The file on disk, or None if it is missing (or the name is not a plain file name)."""
    if not file_name or "/" in file_name or "\\" in file_name or file_name.startswith("."):
        return None
    path = upload_dir() / file_name
    return path if path.is_file() else None


def delete_files(file_names: list[str]) -> None:
    """Remove files after the rows are gone (call after the commit). Missing files are skipped."""
    for name in file_names:
        path = path_of(name)
        if path is not None:
            path.unlink(missing_ok=True)


def parse_multipart(content_type: str, body: bytes) -> dict[str, bytes]:
    """The fields of a multipart/form-data body by name: {"file": bytes, "caption": bytes}.
    Only the first part of each name is kept. Raises BadForm when the body is malformed."""
    header = Message()
    header["content-type"] = content_type
    if header.get_content_type() != "multipart/form-data":
        raise BadForm("expected multipart/form-data")
    boundary = header.get_param("boundary")
    if not isinstance(boundary, str) or not boundary:
        raise BadForm("no multipart boundary")
    delimiter = b"--" + boundary.encode("latin-1")
    chunks = body.split(delimiter)
    if len(chunks) < 3:
        raise BadForm("no multipart parts")
    fields: dict[str, bytes] = {}
    for chunk in chunks[1:]:
        if chunk.startswith(b"--"):
            break  # the closing delimiter
        if not chunk.startswith(b"\r\n"):
            raise BadForm("malformed multipart part")
        head, sep, content = chunk[2:].partition(b"\r\n\r\n")
        if not sep:
            raise BadForm("malformed multipart part")
        if content.endswith(b"\r\n"):
            content = content[:-2]
        part = Message()
        for line in head.decode("latin-1").split("\r\n"):
            name, colon, value = line.partition(":")
            if colon:
                part[name.strip()] = value.strip()
        field = part.get_param("name", header="content-disposition")
        if isinstance(field, str) and field not in fields:
            fields[field] = content
    return fields
