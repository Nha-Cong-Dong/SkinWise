"""Manage who can sign in to the review page:

uv run python -m scripts.reviewers add "Vân Anh"     # asks for a password; again to change it
uv run python -m scripts.reviewers remove "Vân Anh"  # also signs them out everywhere
uv run python -m scripts.reviewers list
"""

import getpass
import sys

from app.db import get_engine, init_schema
from app.reviewers import list_reviewers, remove_reviewer, set_reviewer

MIN_PASSWORD_LENGTH = 12


def main(args: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Vietnamese names; Windows consoles use cp1252
    engine = get_engine()
    init_schema(engine)
    match args:
        case ["add", name]:
            password = getpass.getpass(f"Password for {name}: ")
            if len(password) < MIN_PASSWORD_LENGTH:
                print(f"Use at least {MIN_PASSWORD_LENGTH} characters.")
                return 1
            if getpass.getpass("Again: ") != password:
                print("Passwords do not match.")
                return 1
            with engine.begin() as conn:
                set_reviewer(conn, name, password)
            print(f"{name} can sign in to the review page.")
        case ["remove", name]:
            with engine.begin() as conn:
                removed = remove_reviewer(conn, name)
            print(f"Removed {name}." if removed else f"No reviewer named {name}.")
            return 0 if removed else 1
        case ["list"]:
            with engine.connect() as conn:
                names = list_reviewers(conn)
            print("\n".join(names) if names else "No reviewers yet.")
        case _:
            print(__doc__)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
