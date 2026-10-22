#!/usr/bin/env python3
"""Polices de l'image de marque (PDF et page publique), préparées une fois et versionnées.

Rien n'est téléchargé à l'exécution de l'application : ce script n'est relancé que pour
changer la liste des polices. Sources (dépôt google/fonts, licence SIL OFL 1.1, sans nom
de police réservé pour celles qui sont modifiées ici) :
  Montserrat[wght].ttf, Nunito[wght].ttf  -> instances statiques 400 et 700
  Spectral-Regular/Bold.ttf, BarlowCondensed-Regular/Bold.ttf -> statiques d'origine

Pour chaque fichier : sous-ensemble latin (français, malgache n̈ compris, latin étendu),
ponctuation et symboles monétaires (€ $), puis U+202F (espace fine insécable des montants
« 450 000 Ar », absente de ces polices) rendue par le glyphe de l'espace insécable.
Sorties : TTF pour le PDF (src/modules/billing/fonts) et WOFF2 pour la page publique
(public/fonts/brand), issus du même fichier.

Liberation Sans (police Classique) : le PDF garde le TTF d'origine, non modifié. La page
publique reçoit un WOFF2 tiré de ce même TTF (sous-ensemble ci-dessus). « Liberation » est
un nom de police réservé (OFL 1.1, clause 3) : la version modifiée est renommée
« Ivonea Classique » (même dessin, même licence, LICENSE-LiberationSans.txt à côté).

Usage : python3 -m venv /tmp/venv && /tmp/venv/bin/pip install fonttools==4.55.0 brotli
        /tmp/venv/bin/python scripts/build-brand-fonts.py <dossier des sources>
        /tmp/venv/bin/python scripts/build-brand-fonts.py --classique   (Liberation Sans seule)
"""

import copy
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "src/modules/billing/fonts"
WEB_DIR = ROOT / "public/fonts/brand"

UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x250))  # Latin-1, Latin étendu A et B
    + list(range(0x2B0, 0x370))  # lettres modificatives, diacritiques combinants (n̈)
    + list(range(0x1E00, 0x1F00))  # latin étendu additionnel
    + list(range(0x2000, 0x2070))  # ponctuation générale (– — ‘ ’ « » … espaces)
    + list(range(0x20A0, 0x20C1))  # symboles monétaires (€)
    + [0x2122, 0x2212, 0x2215, 0x2190, 0x2192]
)

# (fichier source, sortie, graisse à instancier ou None)
FONTS = [
    ("Montserrat[wght].ttf", "Montserrat-Regular", 400),
    ("Montserrat[wght].ttf", "Montserrat-Bold", 700),
    ("Nunito[wght].ttf", "Nunito-Regular", 400),
    ("Nunito[wght].ttf", "Nunito-Bold", 700),
    ("Spectral-Regular.ttf", "Spectral-Regular", None),
    ("Spectral-Bold.ttf", "Spectral-Bold", None),
    ("BarlowCondensed-Regular.ttf", "BarlowCondensed-Regular", None),
    ("BarlowCondensed-Bold.ttf", "BarlowCondensed-Bold", None),
]


# Version web seulement, renommée (nom réservé) : (TTF du dépôt, sortie, style).
RENAMED_WEB = [
    ("LiberationSans-Regular.ttf", "IvoneaClassique-Regular", "Regular"),
    ("LiberationSans-Bold.ttf", "IvoneaClassique-Bold", "Bold"),
]
RENAMED_FAMILY = "Ivonea Classique"


def rename(font: TTFont, style: str) -> None:
    family = RENAMED_FAMILY
    full = f"{family} {style}" if style != "Regular" else family
    postscript = f"{family.replace(' ', '')}-{style}"
    names = {1: family, 2: style, 3: f"Ivonea OS: {postscript}", 4: full, 6: postscript, 16: family, 17: style}
    table = font["name"]
    for record in list(table.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 18, 21, 22):
            table.removeNames(nameID=record.nameID)
    for name_id, value in names.items():
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)


def subsetted(font: TTFont) -> TTFont:
    add_narrow_nbsp(font)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    return font


def add_narrow_nbsp(font: TTFont) -> None:
    for table in font["cmap"].tables:
        if table.isUnicode() and 0xA0 in table.cmap and 0x202F not in table.cmap:
            table.cmap[0x202F] = table.cmap[0xA0]


def build(src_dir: Path) -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    for source, name, weight in FONTS:
        font = TTFont(src_dir / source)
        if weight is not None:
            font = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=True)
        subsetted(font)
        font.flavor = None
        font.save(PDF_DIR / f"{name}.ttf")
        web = copy.deepcopy(font)
        web.flavor = "woff2"
        web.save(WEB_DIR / f"{name}.woff2")
        print(name)
    build_renamed_only()


def build_renamed_only() -> None:
    """Seulement les versions web renommées (sans les sources google/fonts)."""
    for source, name, style in RENAMED_WEB:
        font = subsetted(TTFont(PDF_DIR / source))
        rename(font, style)
        font.flavor = "woff2"
        font.save(WEB_DIR / f"{name}.woff2")
        print(name)
    (WEB_DIR / "LICENSE-LiberationSans.txt").write_bytes((PDF_DIR / "LICENSE-LiberationSans.txt").read_bytes())


if __name__ == "__main__":
    if sys.argv[1:] == ["--classique"]:
        build_renamed_only()
    else:
        build(Path(sys.argv[1]))
