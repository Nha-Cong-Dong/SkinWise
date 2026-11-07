"""Remove accounts never verified within 7 days (app.accounts.purge_unverified), and blog
notifications read more than 90 days ago (app.blog.purge_read_notifications), and users' product
photos their routine has not referred to for 7 days (app.product_photos.purge_orphans):
uv run python -m scripts.purge

Run daily by deploy/systemd/skinwise-purge.timer, so the privacy policy's "removed after 7 days"
holds even when nobody registers. Prints only a count, never an address.
"""

from app import images
from app.accounts import purge_unverified
from app.blog import purge_read_notifications
from app.console import use_utf8_output
from app.db import get_engine, init_schema
from app.product_photos import purge_orphans

if __name__ == "__main__":
    use_utf8_output()
    engine = get_engine()
    init_schema(engine)
    with engine.begin() as conn:
        removed = purge_unverified(conn)
        notices = purge_read_notifications(conn)
        photos = purge_orphans(conn)
    images.delete_files(photos)
    print(
        f"Removed {removed} unverified accounts, {notices} old read notifications and "
        f"{len(photos)} unused product photos."
    )
