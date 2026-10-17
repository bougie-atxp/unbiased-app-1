"""Convert selected CodePet pose packs into Unbiased's 8x9 Pal atlas."""

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps


PALS = {
    "cat": "A curious desk companion",
    "robot": "A bright companion for busy work",
    "axolotl": "A calm companion for focused days",
}
ROWS = (
    ("idle", False),
    ("locomotion", False),
    ("locomotion", True),
    ("celebrate", False),
    ("play", False),
    ("error", False),
    ("waiting", False),
    ("working", False),
    ("working", False),
)
CELL_WIDTH = 192
CELL_HEIGHT = 208
STAGE = 2


def convert(source: Path, destination: Path, revision: str) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / "LICENSE", destination / "LICENSE")
    shutil.copyfile(source / "PROVENANCE.md", destination / "PROVENANCE.md")
    for slug, description in PALS.items():
        origin = source / slug
        manifest = json.loads((origin / "manifest.json").read_text())
        atlas = Image.new("RGBA", (CELL_WIDTH * 8, CELL_HEIGHT * len(ROWS)))
        for row, (state, mirrored) in enumerate(ROWS):
            frames = manifest["states"][state]["frames"][:8]
            for column, filename in enumerate(frames):
                with Image.open(origin / f"s{STAGE}" / filename) as frame:
                    if frame.size != (CELL_WIDTH, CELL_WIDTH):
                        raise ValueError(f"Unexpected {slug}/{filename} frame size: {frame.size}")
                    pose = frame.convert("RGBA")
                    if mirrored:
                        pose = ImageOps.mirror(pose)
                    atlas.alpha_composite(pose, (column * CELL_WIDTH, row * CELL_HEIGHT + 8))
        target = destination / slug
        target.mkdir(exist_ok=True)
        atlas.save(target / "spritesheet.webp", format="WEBP", lossless=True, method=6)
        (target / "pet.json").write_text(
            json.dumps(
                {
                    "name": manifest["displayName"],
                    "description": description,
                    "source": f"https://github.com/GreyforgeLabs/codepet/tree/{revision}/qml/assets/pets/{slug}",
                    "license": "MIT",
                },
                indent=2,
            ) + "\n"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="CodePet qml/assets/pets directory")
    parser.add_argument("destination", type=Path, help="Bundled Pal directory")
    parser.add_argument("--revision", required=True, help="Pinned CodePet commit SHA")
    args = parser.parse_args()
    convert(args.source, args.destination, args.revision)
