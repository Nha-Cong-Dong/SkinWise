"""Draft plain-language versions of rule explanations for a reviewer:
uv run python -m scripts.plain_drafts [rule-key ...]

Without keys: every published rule whose explanation_vi has at least 200 characters
(app.plain.MIN_EXPLANATION_CHARS) and that has no plain_vi, or one written for an older
explanation_vi; shorter ones are listed as skipped. With keys: exactly those rules, published
or not. Calls DRAFT_MODEL once per rule and writes _workspace/plain-drafts/<YYYYMMDD-HHMM>.toml.
Never writes data/rules.toml or the reviewer fields: the reviewer pastes and fills them after
reading.
"""

import sys

from app.console import use_utf8_output
from app.plain import main

if __name__ == "__main__":
    use_utf8_output()
    sys.exit(main(sys.argv[1:]))
