"""Remove accounts never verified within 7 days (app.accounts.purge_unverified):
uv run python -m scripts.purge

Run daily by deploy/systemd/skinwise-purge.timer, so the privacy policy's "removed after 7 days"
holds even when nobody registers. Prints only a count, never an address.
"""

from app.accounts import purge_unverified
from app.console import use_utf8_output
from app.db import get_engine, init_schema

if __name__ == "__main__":
    use_utf8_output()
    engine = get_engine()
    init_schema(engine)
    with engine.begin() as conn:
        removed = purge_unverified(conn)
    print(f"Removed {removed} unverified accounts.")
