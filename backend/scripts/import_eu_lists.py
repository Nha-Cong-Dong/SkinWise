"""Download the EU ingredient lists and write them to data/ (rerun when a new glossary is
published): uv run python -m scripts.import_eu_lists

Fetches the Official Journal texts as XHTML from the EU Publications Office (CELLAR), the
channel meant for automated reuse; eur-lex.europa.eu itself serves scripts a bot challenge.
Writes:
  data/eu_glossary.txt          one common ingredient name per line (Decision (EU) 2025/1175)
  data/eu_inventory_2006.tsv    INCI name <TAB> functions joined by "|" (Decision 2006/257/EC)
  data/eu_functions_2006.tsv    function <TAB> official definition (same decision)
"""

import urllib.request
from datetime import date

from app.eu_lists import (
    GLOSSARY_CELEX,
    INVENTORY_CELEX,
    parse_function_definitions,
    parse_glossary,
    parse_inventory,
)
from app.seed import DATA_DIR
from app.sources import USER_AGENT

CELLAR = "http://publications.europa.eu/resource/celex/{celex}"


def fetch_xhtml(celex: str) -> str:
    request = urllib.request.Request(
        CELLAR.format(celex=celex),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/xhtml+xml",
            "Accept-Language": "eng",
        },
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read().decode("utf-8")


def header(celex: str, title: str) -> str:
    return (
        f"# {title}\n"
        f"# Source: CELEX {celex}, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}\n"
        f"# Retrieved {date.today().isoformat()} via scripts/import_eu_lists.py. "
        "© European Union, https://eur-lex.europa.eu. Do not edit by hand.\n"
    )


def main() -> None:
    glossary = parse_glossary(fetch_xhtml(GLOSSARY_CELEX))
    with (DATA_DIR / "eu_glossary.txt").open("w", encoding="utf-8", newline="\n") as f:
        f.write(header(GLOSSARY_CELEX, "EU glossary of common ingredient names"))
        f.writelines(f"{name}\n" for name in glossary)

    inventory_xhtml = fetch_xhtml(INVENTORY_CELEX)
    inventory = parse_inventory(inventory_xhtml)
    title = "EU inventory of cosmetic ingredients (2006, no longer in force): usual functions"
    with (DATA_DIR / "eu_inventory_2006.tsv").open("w", encoding="utf-8", newline="\n") as f:
        f.write(header(INVENTORY_CELEX, title))
        f.writelines(f"{name}\t{'|'.join(codes)}\n" for name, codes in inventory.items())

    definitions = parse_function_definitions(inventory_xhtml)
    title = "Official definitions of ingredient functions (2006 inventory)"
    with (DATA_DIR / "eu_functions_2006.tsv").open("w", encoding="utf-8", newline="\n") as f:
        f.write(header(INVENTORY_CELEX, title))
        f.writelines(f"{code}\t{text}\n" for code, text in definitions.items())

    print(
        f"Wrote {len(glossary)} glossary names, {len(inventory)} inventory entries, "
        f"{len(definitions)} function definitions."
    )


if __name__ == "__main__":
    main()
