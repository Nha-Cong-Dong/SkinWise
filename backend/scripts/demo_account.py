"""The demo account, signed in to show the sample routine and its check:

uv run python -m scripts.demo_account           # create, or bring up to date; safe to run again
uv run python -m scripts.demo_account --reset   # delete demo@skinwise.test, then create it

The password is asked when the account has to be created (or taken from
DEMO_ACCOUNT_PASSWORD). Running again keeps the password and puts the sample routine back.
Only demo@skinwise.test is ever touched (scripts.demo_blog --reset leaves it alone).
"""

import getpass
import os
import sys

from app import images
from app.console import use_utf8_output
from app.db import get_engine, init_schema
from app.demo_account import DEMO_EMAIL, ensure_demo_account, remove_demo_account
from app.passwords import hash_password, password_problem


def ask_password_hash() -> str:
    password = os.environ.get("DEMO_ACCOUNT_PASSWORD") or getpass.getpass(
        f"Password for {DEMO_EMAIL}: "
    )
    if problem := password_problem(password, DEMO_EMAIL):
        raise SystemExit(f"Password refused: {problem}")
    if "DEMO_ACCOUNT_PASSWORD" not in os.environ and getpass.getpass("Again: ") != password:
        raise SystemExit("Passwords do not match.")
    return hash_password(password)


def main(args: list[str]) -> int:
    if any(a != "--reset" for a in args):
        print(__doc__)
        return 1
    engine = get_engine()
    init_schema(engine)
    files: list[str] = []
    with engine.begin() as conn:
        if "--reset" in args and remove_demo_account(conn, files):
            print(f"Removed {DEMO_EMAIL}.")
        account = ensure_demo_account(conn, ask_password_hash)
    images.delete_files(files)  # its photos, now that the deletion is committed
    print(
        f"{'Created' if account.created else 'Updated'} {DEMO_EMAIL} (handle {account.handle}), "
        f"sample routine stored as version {account.routine_version}."
    )
    return 0


if __name__ == "__main__":
    use_utf8_output()
    sys.exit(main(sys.argv[1:]))
