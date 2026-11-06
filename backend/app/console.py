"""Console output for the scripts in backend/scripts."""

import sys


def use_utf8_output() -> None:
    """Print Vietnamese text and INCI names on any console.

    Windows consoles and redirected output often default to cp1252, where printing "đ" or
    "–" raises UnicodeEncodeError and stops the script halfway.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # absent on some test captures
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
