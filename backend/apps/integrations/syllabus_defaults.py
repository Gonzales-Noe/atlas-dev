import copy
import json
from pathlib import Path

_DEFAULTS_PATH = Path(__file__).with_name('syllabus_sections_default.json')
_defaults = None


def default_syllabus_sections():
    """The shared Faculty Syllabus structure, mirrored from the frontend blueprint."""
    global _defaults
    if _defaults is None:
        _defaults = json.loads(_DEFAULTS_PATH.read_text(encoding='utf-8'))
    return copy.deepcopy(_defaults)
